// Builds the desktop shell into dist/apps/desktop (run by `nx build desktop`):
//
//   main.js              the loader — the entry point of the installed app (src/loader.ts)
//   bundle/app.js        the app itself (src/main.ts with everything it imports)
//   bundle/preload.js    the bridge to the pages (src/preload.ts)
//   bundle/assets/*      the icon, the setup page, the window script
//   bundle/bundle.json   the manifest: a fingerprint of the files above and their hashes
//   package.json
//
// The bundle is what an installed app downloads from the server to update itself
// (src/update/updater.ts), so the same sources must give the same files on any system.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'apps/desktop/src';
const OUT = 'dist/apps/desktop';
const BUNDLE = join(OUT, 'bundle');
/** Text files are written with Unix line ends: git on Windows may have checked them out otherwise. */
const TEXT = /\.(html|ps1|json|css|js)$/;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(BUNDLE, 'assets'), { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'warning',
};
await build({ ...shared, entryPoints: [join(SOURCE, 'loader.ts')], outfile: join(OUT, 'main.js') });
await build({ ...shared, entryPoints: [join(SOURCE, 'main.ts')], outfile: join(BUNDLE, 'app.js') });
await build({
  ...shared,
  entryPoints: [join(SOURCE, 'preload.ts')],
  outfile: join(BUNDLE, 'preload.js'),
});

for (const name of readdirSync(join(SOURCE, 'assets'))) {
  const content = readFileSync(join(SOURCE, 'assets', name));
  writeFileSync(
    join(BUNDLE, 'assets', name),
    TEXT.test(name) ? content.toString('utf8').replace(/\r\n/g, '\n') : content,
  );
}

const names = [
  'app.js',
  'preload.js',
  ...readdirSync(join(BUNDLE, 'assets')).map((name) => `assets/${name}`),
].sort();
const files = Object.fromEntries(
  names.map((name) => [
    name,
    createHash('sha512')
      .update(readFileSync(join(BUNDLE, name)))
      .digest('base64'),
  ]),
);
// The base the code is written for — the one constant shared with the sources.
const shell = Number(
  /SHELL_VERSION = (\d+)/.exec(readFileSync(join(SOURCE, 'update/bundle-store.ts'), 'utf8'))?.[1],
);
if (!Number.isInteger(shell)) {
  throw new Error('SHELL_VERSION is not found in update/bundle-store.ts');
}
const version = createHash('sha256')
  .update(JSON.stringify([shell, files]))
  .digest('hex')
  .slice(0, 16);
writeFileSync(
  join(BUNDLE, 'bundle.json'),
  JSON.stringify({ version, shell, files }, null, 2) + '\n',
);

cpSync('apps/desktop/package.json', join(OUT, 'package.json'));
console.log(`desktop bundle ${version} (shell ${shell}): ${names.join(', ')}`);
