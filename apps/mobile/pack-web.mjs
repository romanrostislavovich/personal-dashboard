// The interface the Android app takes from the server (MobileAppService in web-core): the built
// web app as one zip, and its version — a hash of what is inside, so the same build is never
// downloaded twice.
//
//   node apps/mobile/pack-web.mjs dist/apps/web/browser dist/apps/mobile-bundle
//
// The service worker stays out: the app has none, its interface is on the phone anyway.
import {createHash} from 'node:crypto';
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative, sep} from 'node:path';
import {zipSync} from 'fflate';

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error(
    'Usage: node apps/mobile/pack-web.mjs <built web app> <out folder>',
  );
  process.exit(1);
}

const SKIP = new Set([
  'ngsw-worker.js',
  'ngsw.json',
  'safety-worker.js',
  'worker-basic.min.js',
]);

const files = {};
const hash = createHash('sha256');
const walk = dir => {
  for (const entry of readdirSync(dir, {withFileTypes: true}).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (!SKIP.has(entry.name)) {
      const name = relative(from, path).split(sep).join('/');
      const data = readFileSync(path);
      files[name] = data;
      hash.update(name).update(data);
    }
  }
};
walk(from);

const version = hash.digest('hex').slice(0, 16);
mkdirSync(to, {recursive: true});
writeFileSync(join(to, 'web.zip'), zipSync(files, {level: 9}));
writeFileSync(
  join(to, 'bundle.json'),
  `${JSON.stringify({version}, null, 2)}\n`,
);
console.log(`Mobile interface ${version}: ${Object.keys(files).length} files`);
