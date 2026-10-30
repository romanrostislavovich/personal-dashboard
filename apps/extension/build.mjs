// Builds the browser extension into dist/apps/extension (run by `nx build extension`): a folder
// Chrome loads as it is ("Load unpacked", see apps/extension/README.md).
//
//   manifest.json, _locales/*      as written; the manifest's version made from the fingerprint
//   background.js                  the service worker (src/background/background.ts)
//   content.js                     the content script of every page (src/content/content.ts)
//   popup.html, popup.css, popup.js
//   inline-menu.html, .css, .js    the menu under a login field, in a frame of the page
//   blocked.html, .css, .js        instead of a site kept closed (a focus session, a limit)
//   sidepanel.html, .css, .js      the assistant beside the page (Chrome's side panel)
//   icons/*.png
//   bundle.json                    the fingerprint (`version`) and the sha512 of every file
//   personal-dashboard-extension.zip   all of the above, to download (not in bundle.json)
//
// The server hands the folder out at /extension-updates; the desktop app keeps a copy of it up
// to date for Chrome to load, and the extension reloads itself when its files change (see
// src/background/self-update.ts). So the same sources must give the same files on any system:
// text is written with Unix line ends, the icons are files of the repository.
import {build} from 'esbuild';
import {zipSync} from 'fflate';
import {createHash} from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {dirname, join, relative} from 'node:path';

const SOURCE = 'apps/extension/src';
const OUT = 'dist/apps/extension';
const MANIFEST = 'manifest.json';
const BUNDLE = 'bundle.json';
const ZIP = 'personal-dashboard-extension.zip';
const TEXT = /\.(html|json|css|js)$/;

rmSync(OUT, {recursive: true, force: true});
mkdirSync(OUT, {recursive: true});

/**
 * The contracts are declarations only, but esbuild takes their module-level `z.object(...)` for
 * side effects and would bundle all of them (and zod) into a page that uses one constant. Told
 * they have none, it keeps only the modules a bundle uses.
 */
const pureContracts = {
  name: 'pure-contracts',
  setup(builder) {
    builder.onResolve({filter: /^@pd\/contracts$|^\.\.?\//}, async args => {
      if (args.pluginData === 'pure-contracts') {
        return undefined;
      }
      const resolved = await builder.resolve(args.path, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: 'pure-contracts',
      });
      const inContracts = resolved.path
        .replace(/\\/g, '/')
        .includes('/libs/shared/contracts/');
      return inContracts ? {...resolved, sideEffects: false} : undefined;
    });
  },
};

const shared = {
  plugins: [pureContracts],
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
for (const entry of [
  'content/content.ts',
  'popup/popup.ts',
  'menu/inline-menu.ts',
  'blocked/blocked.ts',
  'sidepanel/sidepanel.ts',
]) {
  await build({
    ...shared,
    format: 'iife',
    entryPoints: [join(SOURCE, entry)],
    outfile: join(OUT, `${entry.split('/')[1].replace('.ts', '')}.js`),
  });
}

const copy = (from, to) => {
  const content = readFileSync(join(SOURCE, from));
  mkdirSync(dirname(join(OUT, to)), {recursive: true});
  writeFileSync(
    join(OUT, to),
    TEXT.test(to) ? content.toString('utf8').replace(/\r\n/g, '\n') : content,
  );
};
for (const file of files(join(SOURCE, '_locales')).concat(
  files(join(SOURCE, 'icons')),
)) {
  const name = relative(SOURCE, file).replace(/\\/g, '/');
  copy(name, name);
}
copy('popup/popup.html', 'popup.html');
copy('popup/popup.css', 'popup.css');
copy('menu/inline-menu.html', 'inline-menu.html');
copy('menu/inline-menu.css', 'inline-menu.css');
copy('blocked/blocked.html', 'blocked.html');
copy('blocked/blocked.css', 'blocked.css');
copy('sidepanel/sidepanel.html', 'sidepanel.html');
copy('sidepanel/sidepanel.css', 'sidepanel.css');

// The fingerprint of everything but the manifest, which then carries it as its version.
const hashes = () =>
  Object.fromEntries(
    files(OUT)
      .map(file => relative(OUT, file).replace(/\\/g, '/'))
      .filter(name => name !== BUNDLE && name !== ZIP)
      .sort()
      .map(name => [
        name,
        createHash('sha512')
          .update(readFileSync(join(OUT, name)))
          .digest('base64'),
      ]),
  );
const code = Object.fromEntries(
  Object.entries(hashes()).filter(([name]) => name !== MANIFEST),
);
const version = createHash('sha256')
  .update(JSON.stringify(code))
  .digest('hex')
  .slice(0, 16);

const manifest = JSON.parse(readFileSync(join(SOURCE, MANIFEST), 'utf8'));
manifest.version = chromeVersion(manifest.version, version);
manifest.version_name = version;
writeFileSync(join(OUT, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(
  join(OUT, BUNDLE),
  JSON.stringify({version, files: hashes()}, null, 2) + '\n',
);

// The zip to download; a fixed date, so the same files give the same zip.
const entries = Object.fromEntries(
  files(OUT)
    .map(file => relative(OUT, file).replace(/\\/g, '/'))
    .sort()
    .map(name => [
      name,
      [readFileSync(join(OUT, name)), {mtime: new Date('2020-01-01')}],
    ]),
);
writeFileSync(join(OUT, ZIP), zipSync(entries, {level: 9}));
console.log(`extension ${version} built into ${OUT}`);

/** Every file under a folder. */
function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/**
 * Chrome wants a version of up to four numbers below 65536: the written one (`1.0`) and two
 * numbers from the fingerprint, so every build differs from the one before.
 */
function chromeVersion(written, fingerprint) {
  const [major = '1', minor = '0'] = written.split('.');
  return [
    major,
    minor,
    parseInt(fingerprint.slice(0, 4), 16),
    parseInt(fingerprint.slice(4, 8), 16),
  ].join('.');
}
