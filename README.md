# @bosh-code/tsdown-plugin-tailwindcss

[![npm version](https://img.shields.io/npm/v/@bosh-code/tsdown-plugin-tailwindcss)](https://npmjs.com/package/@bosh-code/tsdown-plugin-tailwindcss)
[![npm downloads](https://img.shields.io/npm/dm/@bosh-code/tsdown-plugin-tailwindcss)](https://npmjs.com/package/@bosh-code/tsdown-plugin-tailwindcss)

Use [tailwindcss](https://tailwindcss.com/) in your [tsdown](https://tsdown.dev/) component libraries.

The `@tailwindcss/vite` plugin unfortunately doesn't work with tsdown, so I created this plugin which is a modified version of that plugin but with tsdown support.
This plugin extracts classes from your source files and enables use of libraries like [daisyui](https://daisyui.com/), just like the vite plugin.

I intend for this plugin to be used with [@bosh-code/tsdown-plugin-inject-css](https://www.npmjs.com/package/@bosh-code/tsdown-plugin-inject-css), as you need someway of importing the built CSS in the bundle.
You can achieve the same result in other ways if you would prefer not to use the plugin, but I find the plugin to be nicer.

## Installation

Install the plugin:

```shell
# npm
npm install -D @bosh-code/tsdown-plugin-inject-css @bosh-code/tsdown-plugin-tailwindcss

# yarn
yarn add -D @bosh-code/tsdown-plugin-inject-css @bosh-code/tsdown-plugin-tailwindcss

# pnpm
pnpm add -D @bosh-code/tsdown-plugin-inject-css @bosh-code/tsdown-plugin-tailwindcss
```

Add the plugins to your `tsdown.config.ts`:

```ts
// tsdown.config.ts

import { injectCssPlugin } from '@bosh-code/tsdown-plugin-inject-css';
import { tailwindPlugin } from '@bosh-code/tsdown-plugin-tailwindcss';

export default defineConfig({
  external: ['preact'],
  plugins: [
    tailwindPlugin(),
    injectCssPlugin()
  ]
});

```

And add the tailwind import to your library entrypoint CSS file, usually `src/index.css`:

```css
/* src/index.css */
@import "tailwindcss";

/* Add any other global styles here */
```

___

### The how and why

This plugin is a modified version of the [@tailwindcss/vite](https://www.npmjs.com/package/@tailwindcss/vite) plugin that I created to work with my preact component library.

**Contributions welcome!**

### License

MIT © bosh-code

<div align="center" style="max-width: 120px;">
  <img style="max-width: 120px" width="120px" src="https://raw.githubusercontent.com/bosh-code/tsdown-plugin-tailwindcss/main/.github/images/nz-made.png">
</div>
