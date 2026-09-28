import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/modules/finance/api',
  // @pd/* aliases from tsconfig.base.json.
  resolve: { tsconfigPaths: true },
  test: {
    name: 'finance-api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/modules/finance/api',
      provider: 'v8' as const,
    },
  },
}));
