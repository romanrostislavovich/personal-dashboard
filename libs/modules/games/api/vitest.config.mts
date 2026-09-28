import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/modules/games/api',
  // @pd/* aliases from tsconfig.base.json.
  resolve: { tsconfigPaths: true },
  test: {
    name: 'games-api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/modules/games/api',
      provider: 'v8' as const,
    },
  },
}));
