import { compile, Features, Instrumentation, normalizePath, optimize, toSourceMap } from '@tailwindcss/node';
import { clearRequireCache } from '@tailwindcss/node/require-cache';
import { Scanner } from '@tailwindcss/oxide';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'rolldown';

export type TailwindPluginOptions = {
  /**
   * Enable CSS minification (default: true in production)
   */
  minify?: boolean
  /**
   * Enable source maps (default: false)
   */
  sourcemap?: boolean
  /**
   * Base directory for resolving paths (default: process.cwd())
   */
  base?: string
}

export const tailwindPlugin = (options: TailwindPluginOptions = {}): Plugin => {
  let base = options.base || process.cwd();
  let minify = options.minify ?? process.env.NODE_ENV === 'production';
  let enableSourceMaps = options.sourcemap ?? false;

  let roots: DefaultMap<string, Root> = new DefaultMap((id) => {
    return new Root(id, base, enableSourceMaps);
  });

  return {
    name: '@tailwindcss/tsdown',

    async transform(src, id) {
      if (!isPotentialCssRootFile(id)) return null;
      console.log('BOSH: tailwind-plugin: transform', { id, src });

      using I = new Instrumentation();
      I.start('[@tailwindcss/tsdown] Generate CSS');

      let root = roots.get(id);
      console.log('BOSH: tailwind-plugin: root', root);

      let result = await root.generate(
        src,
        (file) => {
          // Add file to watch list
          this.addWatchFile?.(file);
        },
        I
      );

      if (!result) {
        roots.delete(id);
        return null;
      }

      I.end('[@tailwindcss/tsdown] Generate CSS');

      // Optimize CSS in production
      if (minify || process.env.NODE_ENV === 'production') {
        I.start('[@tailwindcss/tsdown] Optimize CSS');
        result = optimize(result.code, {
          minify: true,
          map: result.map
        });
        I.end('[@tailwindcss/tsdown] Optimize CSS');
      }

      return {
        code: result.code,
        map: result.map
      };
    }
  };
};

function isPotentialCssRootFile(id: string): boolean {
  // Skip node_modules and virtual modules
  if (id.includes('/node_modules/') || id.startsWith('\0')) {
    return false;
  }

  let extension = getExtension(id);
  return extension === 'css';
}

function getExtension(id: string): string {
  let [filename] = id.split('?', 2);
  return path.extname(filename).slice(1);
}

function idToPath(id: string): string {
  return path.resolve(id.replace(/\?.*$/, ''));
}

/**
 * A Map that can generate default values for keys that don't exist.
 * Generated default values are added to the map to avoid recomputation.
 */
class DefaultMap<K, V> extends Map<K, V> {
  constructor(private factory: (key: K, self: DefaultMap<K, V>) => V) {
    super();
  }

  get(key: K): V {
    let value = super.get(key);

    if (value === undefined) {
      value = this.factory(key, this);
      this.set(key, value);
    }

    return value;
  }
}

class Root {
  // The lazily-initialized Tailwind compiler components
  private compiler?: Awaited<ReturnType<typeof compile>>;

  // The lazily-initialized Tailwind scanner
  private scanner?: Scanner;

  // List of all candidates found during scanning
  private candidates: Set<string> = new Set<string>();

  // List of all build dependencies and their last modification timestamp
  private buildDependencies = new Map<string, number | null>();

  constructor(
    private id: string,
    private base: string,
    private enableSourceMaps: boolean
  ) {}

  public async generate(
    content: string,
    addWatchFile: (file: string) => void,
    I: Instrumentation
  ): Promise<
    | {
    code: string
    map: string | undefined
  }
    | false
  > {
    let inputPath = idToPath(this.id);
    let inputBase = path.dirname(path.resolve(inputPath));

    let requiresBuildPromise = this.requiresBuild();

    if (!this.compiler || !this.scanner || (await requiresBuildPromise)) {
      clearRequireCache(Array.from(this.buildDependencies.keys()));
      this.buildDependencies.clear();

      this.addBuildDependency(inputPath);

      I.start('Setup compiler');
      let addBuildDependenciesPromises: Promise<void>[] = [];

      this.compiler = await compile(content, {
        from: this.enableSourceMaps ? this.id : undefined,
        base: inputBase,
        shouldRewriteUrls: true,
        onDependency: (path) => {
          // Skip watching the input file itself
          if (path !== inputPath) {
            addWatchFile(path);
          }
          addBuildDependenciesPromises.push(this.addBuildDependency(path));
        }
      });

      await Promise.all(addBuildDependenciesPromises);
      I.end('Setup compiler');

      I.start('Setup scanner');

      let sources = (() => {
        // Disable auto source detection
        if (this.compiler.root === 'none') {
          return [];
        }

        // No root specified, auto-detect based on the `**/*` pattern
        if (this.compiler.root === null) {
          return [{ base: this.base, pattern: '**/*', negated: false }];
        }

        // Use the specified root
        return [{ ...this.compiler.root, negated: false }];
      })().concat(this.compiler.sources);

      this.scanner = new Scanner({ sources });
      I.end('Setup scanner');
    } else {
      // Add existing build dependencies to watch list
      for (let buildDependency of this.buildDependencies.keys()) {
        if (buildDependency !== inputPath) {
          addWatchFile(buildDependency);
        }
      }
    }

    // Check if this is actually a Tailwind CSS file
    if (
      !(
        this.compiler.features &
        (Features.AtApply | Features.JsPluginCompat | Features.ThemeFunction | Features.Utilities)
      )
    ) {
      return false;
    }

    if (this.compiler.features & Features.Utilities) {
      I.start('Scan for candidates');
      for (let candidate of this.scanner.scan()) {
        this.candidates.add(candidate);
      }
      I.end('Scan for candidates');

      // Watch individual files found via custom `@source` paths
      for (let file of this.scanner.files) {
        addWatchFile(file);
      }

      // Watch globs found via custom `@source` paths
      for (let glob of this.scanner.globs) {
        if (glob.pattern[0] === '!') continue;

        let relative = path.relative(this.base, glob.base);
        if (relative[0] !== '.') {
          relative = './' + relative;
        }
        // Ensure relative is a posix style path
        relative = normalizePath(relative);

        addWatchFile(path.posix.join(relative, glob.pattern));

        let root = this.compiler.root;

        if (root !== 'none' && root !== null) {
          let basePath = normalizePath(path.resolve(root.base, root.pattern));

          let isDir = await fs.stat(basePath).then(
            (stats) => stats.isDirectory(),
            () => false
          );

          if (!isDir) {
            throw new Error(
              `The path given to \`source(…)\` must be a directory but got \`source(${basePath})\` instead.`
            );
          }
        }
      }
    }

    I.start('Build CSS');
    let code = this.compiler.build([...this.candidates]);
    I.end('Build CSS');

    I.start('Build Source Map');
    let map = this.enableSourceMaps ? toSourceMap(this.compiler.buildSourceMap()).raw : undefined;
    I.end('Build Source Map');

    return {
      code,
      map
    };
  }

  private async addBuildDependency(path: string): Promise<void> {
    let mtime: number | null = null;
    try {
      mtime = (await fs.stat(path)).mtimeMs;
    } catch {}
    this.buildDependencies.set(path, mtime);
  }

  private async requiresBuild(): Promise<boolean> {
    for (let [path, mtime] of this.buildDependencies) {
      if (mtime === null) return true;
      try {
        let stat = await fs.stat(path);
        if (stat.mtimeMs > mtime) {
          return true;
        }
      } catch {
        return true;
      }
    }
    return false;
  }
}
