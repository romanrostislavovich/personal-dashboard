import {defineConfig} from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  // @pd/* aliases from tsconfig.base.json.
  resolve: {tsconfigPaths: true},
  plugins: [angular()],
}));
