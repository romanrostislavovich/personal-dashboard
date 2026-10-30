// PostToolUse (Edit|Write): the edited file is formatted by prettier and fixed by eslint at once;
// what eslint cannot fix goes back to Claude (exit 2), so it is fixed before it reaches CI.
import {existsSync} from 'node:fs';
import {
  eslint,
  inWorkspace,
  LINTED,
  prettier,
  readInput,
} from './lint-tools.mjs';

const input = await readInput();
const file = input.tool_input?.file_path ?? input.tool_response?.filePath;
if (!file || !existsSync(file) || !inWorkspace(file)) {
  process.exit(0);
}

prettier(['--write', '--ignore-unknown', '--log-level', 'warn', file]);
if (LINTED.test(file)) {
  const failures = eslint([file], ['--fix']);
  if (failures.length) {
    process.stderr.write(
      `ESLint still finds problems in ${file}:\n${failures.join('\n')}`,
    );
    process.exit(2);
  }
}
