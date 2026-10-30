import {defineConfig} from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/extension',
  // @pd/* aliases from tsconfig.base.json.
  resolve: {
    tsconfigPaths: true,
    // The specs are outside tsconfig.json, whose aliases the line above reads.
    alias: {
      '@pd/contracts': `${import.meta.dirname}/../../libs/shared/contracts/src/index.ts`,
    },
  },
  test: {
    name: 'extension',
    watch: false,
    globals: true,
    // The content script works on pages: its specs build forms in jsdom.
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
}));
