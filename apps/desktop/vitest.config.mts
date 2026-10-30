import {defineConfig} from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/desktop',
  resolve: {
    alias: {
      '@pd/contracts': `${import.meta.dirname}/../../libs/shared/contracts/src/index.ts`,
      '@pd/client-core': `${import.meta.dirname}/../../libs/client/core/src/index.ts`,
    },
  },
  test: {
    name: 'desktop',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    watch: false,
  },
});
