import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';

import { config as bosh } from '@bosh-code/eslint-plugin';

export default defineConfig([
  {
    files: ['*.ts'],
    extends: [bosh.configs.node]
  }
]) as Linter.Config[];
