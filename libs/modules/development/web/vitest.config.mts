import {defineConfig} from 'vitest/config';

// Tests of plain TypeScript (the helpers of the pages), without Angular components.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/modules/development/web',
  // @pd/* aliases from tsconfig.base.json.
  resolve: {tsconfigPaths: true},
  test: {
    name: 'development-web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    // The helpers import @pd/web-core, whose Angular classes need the JIT compiler to load.
    setupFiles: ['@angular/compiler'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/modules/development/web',
      provider: 'v8' as const,
    },
  },
}));
