// PreToolUse (Bash `git commit`): the staged code must pass prettier and eslint as CI runs them;
// otherwise the commit is blocked (exit 2) with what to fix.
import {spawnSync} from 'node:child_process';
import {
  eslint,
  inWorkspace,
  LINTED,
  prettier,
  readInput,
  ROOT,
} from './lint-tools.mjs';

const input = await readInput();
if (!/\bgit\b[^|;&]*\bcommit\b/.test(input.tool_input?.command ?? '')) {
  process.exit(0);
}

const staged = spawnSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  },
)
  .stdout.split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .filter(inWorkspace);
if (!staged.length) {
  process.exit(0);
}

const problems = [];
// In batches: Windows takes a command line of about 32 thousand characters.
for (let i = 0; i < staged.length; i += 100) {
  const format = prettier([
    '--check',
    '--ignore-unknown',
    '--log-level',
    'warn',
    ...staged.slice(i, i + 100),
  ]);
  if (format.status !== 0) {
    problems.push(
      `Prettier (run it with --write):\n${format.stdout}${format.stderr}`,
    );
  }
}
/** Typed eslint takes seconds a file: a commit bigger than this is linted by the full run and CI. */
const ESLINT_AT_MOST = 150;
const code = staged.filter(file => LINTED.test(file));
if (code.length > ESLINT_AT_MOST) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `${code.length} code files staged: eslint is left to the full lint run and CI (prettier checked).`,
    }),
  );
} else if (code.length) {
  problems.push(...eslint(code));
}
if (problems.length) {
  process.stderr.write(
    `The commit is blocked: the staged files fail lint.\n${problems.join('\n')}`,
  );
  process.exit(2);
}
