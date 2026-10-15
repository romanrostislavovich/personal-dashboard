// Builds the browser extension into dist/apps/extension (run by `nx build extension`): a folder
// Chrome loads as it is ("Load unpacked", see apps/extension/README.md).
//
//   manifest.json, _locales/*      as written
//   background.js                  the service worker (src/background/background.ts)
//   content.js                     the content script of every page (src/content/content.ts)
//   popup.html, popup.css, popup.js
//   icons/*.png                    the dashboard's icon in the sizes Chrome asks for
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'apps/extension/src';
const OUT = 'dist/apps/extension';
const ICON = 'apps/desktop/icon.png';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'icons'), { recursive: true });

const shared = {
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  legalComments: 'none',
  minify: true,
  logLevel: 'warning',
  tsconfig: 'apps/extension/tsconfig.json',
};
await build({
  ...shared,
  format: 'esm',
  entryPoints: [join(SOURCE, 'background/background.ts')],
  outfile: join(OUT, 'background.js'),
});
// A content script is a classic script, not a module.
await build({
  ...shared,
  format: 'iife',
  entryPoints: [join(SOURCE, 'content/content.ts')],
  outfile: join(OUT, 'content.js'),
});
await build({
  ...shared,
  format: 'iife',
  entryPoints: [join(SOURCE, 'popup/popup.ts')],
  outfile: join(OUT, 'popup.js'),
});

cpSync(join(SOURCE, 'manifest.json'), join(OUT, 'manifest.json'));
cpSync(join(SOURCE, '_locales'), join(OUT, '_locales'), { recursive: true });
cpSync(join(SOURCE, 'popup/popup.html'), join(OUT, 'popup.html'));
cpSync(join(SOURCE, 'popup/popup.css'), join(OUT, 'popup.css'));
for (const size of [16, 32, 48, 128]) {
  await sharp(ICON)
    .resize(size, size)
    .png()
    .toFile(join(OUT, 'icons', `${size}.png`));
}
console.log(`extension built into ${OUT}`);
