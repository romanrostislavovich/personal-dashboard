import {defineConfig} from 'vitest/config';

// Tests of plain TypeScript and small Angular services, without rendering components.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/web/core',
  // @pd/* aliases from tsconfig.base.json.
  resolve: {tsconfigPaths: true},
  test: {
    name: 'web-core',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/web/core',
      provider: 'v8' as const,
    },
  },
}));
