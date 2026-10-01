import { defineConfig } from 'vitest/config';
import { API_TEST_ENV } from '../../../api/core/test-env.mts';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/modules/development/api',
  // @pd/* aliases from tsconfig.base.json.
  resolve: { tsconfigPaths: true },
  test: {
    env: API_TEST_ENV,
    name: 'development-api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/modules/development/api',
      provider: 'v8' as const,
    },
  },
}));
