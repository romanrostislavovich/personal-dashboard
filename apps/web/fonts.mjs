// The fonts of the app, kept in apps/web/public/fonts and served by the dashboard itself: the
// Android app and an installed one have them without a network, and nothing asks Google. Run
// it again to take newer versions, and commit what it writes:
//
//   node apps/web/fonts.mjs
//
// Inter and Manrope (SIL Open Font License), Material Symbols Rounded (Apache 2.0), from
// Google Fonts; only the alphabets the app speaks: Latin (with Polish and the like), Cyrillic.
import {createHash} from 'node:crypto';
import {mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const OUT = 'apps/web/public/fonts';
const SHEETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&display=block',
];
/** Google answers a browser it knows with woff2. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const KEEP = new Set([
  'latin',
  'latin-ext',
  'cyrillic',
  'cyrillic-ext',
  'fallback',
]);

mkdirSync(OUT, {recursive: true});
for (const file of readdirSync(OUT)) {
  rmSync(join(OUT, file));
}

const files = new Map();
let css = '/* Written by apps/web/fonts.mjs — do not edit by hand. */\n';
for (const sheet of SHEETS) {
  const text = await (
    await fetch(sheet, {headers: {'User-Agent': USER_AGENT}})
  ).text();
  // Blocks are "/* subset */ @font-face {…}"; what follows the last one (a class) is kept too.
  for (const block of text.split(/(?=\/\* [\w-]+ \*\/)/)) {
    const subset = block.match(/^\/\* ([\w-]+) \*\//)?.[1];
    if (subset && !KEEP.has(subset)) {
      continue;
    }
    let local = block;
    for (const [, url] of block.matchAll(/url\((https:[^)]+)\)/g)) {
      if (!files.has(url)) {
        const data = Buffer.from(await (await fetch(url)).arrayBuffer());
        const name = `${createHash('sha256').update(data).digest('hex').slice(0, 12)}.woff2`;
        writeFileSync(join(OUT, name), data);
        files.set(url, name);
      }
      local = local.replace(url, files.get(url));
    }
    css += local;
  }
}
writeFileSync(join(OUT, 'fonts.css'), css);
console.log(`${files.size} font files in ${OUT}`);
