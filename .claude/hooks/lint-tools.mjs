// Shared by the hooks: run the workspace's own prettier and eslint, the way CI does
// (eslint from the folder of the project's eslint.config, so Angular templates are checked too).
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join, relative, resolve, sep} from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');

/** Files no tool here should touch: generated, or another build system's. */
const SKIPPED = [
  'node_modules',
  'dist',
  `apps${sep}mobile${sep}android`,
  `apps${sep}api${sep}migrations${sep}meta`,
  '.nx',
  '.angular',
];

export const LINTED = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

export function inWorkspace(file) {
  const path = relative(ROOT, resolve(file));
  return (
    !!path &&
    !path.startsWith('..') &&
    !SKIPPED.some(
      part => path.split(sep).includes(part) || path.startsWith(part),
    )
  );
}

function run(script, args, cwd) {
  return spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

export function prettier(args) {
  return run('node_modules/prettier/bin/prettier.cjs', args, ROOT);
}

/** The folder of the eslint.config that governs the file: its project, or the root. */
export function projectOf(file) {
  for (
    let dir = dirname(resolve(file));
    dir.startsWith(ROOT);
    dir = dirname(dir)
  ) {
    if (
      ['mjs', 'js', 'cjs'].some(ext =>
        existsSync(join(dir, `eslint.config.${ext}`)),
      )
    ) {
      return dir;
    }
    if (dir === ROOT) {
      break;
    }
  }
  return ROOT;
}

export function eslint(files, extra = []) {
  const byProject = new Map();
  for (const file of files) {
    const project = projectOf(file);
    byProject.set(project, [...(byProject.get(project) ?? []), resolve(file)]);
  }
  const failures = [];
  for (const [project, list] of byProject) {
    const result = run(
      'node_modules/eslint/bin/eslint.js',
      ['--no-warn-ignored', '--quiet', ...extra, ...list],
      project,
    );
    if (result.status !== 0) {
      failures.push((result.stdout || '') + (result.stderr || ''));
    }
  }
  return failures;
}

export async function readInput() {
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text ? JSON.parse(text) : {};
}
