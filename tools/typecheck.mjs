// `npm run typecheck [-- <folder>…]`: the types of every library (or of the folders given) as CI's
// build sees them — Angular libraries with `ngc` (their templates too), the rest with `tsc` — a
// few at a time. Faster than a build and it names every failing project at the end.
import {spawn} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {cpus} from 'node:os';
import {join, relative, sep} from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const AT_ONCE = Math.max(1, Math.min(4, cpus().length - 1));

/** Folders with a `tsconfig.lib.json` under `libs/`, and the desktop app. */
function projects() {
  const found = [];
  const walk = folder => {
    for (const name of readdirSync(folder)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const path = join(folder, name);
      if (!statSync(path).isDirectory()) continue;
      if (existsSync(join(path, 'tsconfig.lib.json'))) found.push(path);
      else walk(path);
    }
  };
  walk(join(ROOT, 'libs'));
  found.push(join(ROOT, 'apps', 'desktop'));
  return found;
}

function command(folder) {
  const lib = join(folder, 'tsconfig.lib.json');
  if (!existsSync(lib)) {
    return ['tsc', ['-p', join(folder, 'tsconfig.json'), '--noEmit']];
  }
  const angular = readFileSync(join(folder, 'tsconfig.json'), 'utf8').includes(
    'angularCompilerOptions',
  );
  return angular
    ? ['ngc', ['-p', lib, '--noEmit']]
    : [
        'tsc',
        [
          '-p',
          lib,
          '--noEmit',
          '--declaration',
          'false',
          '--declarationMap',
          'false',
        ],
      ];
}

function check(folder) {
  const [tool, args] = command(folder);
  return new Promise(resolve => {
    // One command line: on Windows `npx` is a script, which only runs through a shell.
    const line = ['npx', tool, ...args.map(arg => JSON.stringify(arg))].join(
      ' ',
    );
    const child = spawn(line, {cwd: ROOT, shell: true});
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    child.on('close', code => {
      // ngc prints Angular's extended diagnostics as warnings: only errors fail a project.
      const failed = code !== 0 || /error (TS|NG)\d+/.test(output);
      resolve({
        folder: relative(ROOT, folder).split(sep).join('/'),
        failed,
        output,
      });
    });
  });
}

const given = process.argv.slice(2).map(folder => join(ROOT, folder));
const queue = given.length ? given : projects();
const failures = [];
let done = 0;
const total = queue.length;

async function worker() {
  for (let folder = queue.shift(); folder; folder = queue.shift()) {
    const result = await check(folder);
    done++;
    console.log(
      `${result.failed ? '✗' : '✓'} ${result.folder} (${done}/${total})`,
    );
    if (result.failed) failures.push(result);
  }
}

await Promise.all(Array.from({length: AT_ONCE}, worker));
for (const failure of failures) {
  console.log(`\n── ${failure.folder}\n${failure.output.trim()}`);
}
process.exitCode = failures.length ? 1 : 0;
