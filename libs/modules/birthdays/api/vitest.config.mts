import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/modules/birthdays/api',
  // @pd/* aliases from tsconfig.base.json.
  resolve: { tsconfigPaths: true },
  test: {
    name: 'birthdays-api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/modules/birthdays/api',
      provider: 'v8' as const,
    },
  },
}));
