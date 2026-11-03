import {defineConfig} from 'vitest/config';

// Tests of plain TypeScript (the byte formatter), without Angular components.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/libs/modules/vpn/web',
  // @pd/* aliases from tsconfig.base.json.
  resolve: {tsconfigPaths: true},
  test: {
    name: 'vpn-web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../../coverage/libs/modules/vpn/web',
      provider: 'v8' as const,
    },
  },
}));
