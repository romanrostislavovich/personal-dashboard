// SessionStart: what a new session should know before it touches anything — the repository (the
// branch, what is not committed, main's commits made elsewhere), CI of main, the commit the server
// runs, and a reminder to look at the owner's open bugs. Each part is best-effort: a missing tool
// or no network leaves a line saying so, never a failed start.
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {ROOT} from './lint-tools.mjs';

const GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';

function run(command, args, timeout = 15_000) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

const lines = ['# The state at the start of this session'];

// The repository.
const branch = run('git', ['branch', '--show-current']);
const dirty = (run('git', ['status', '--short']) ?? '')
  .split('\n')
  .filter(line => line && !line.includes('.junie/'));
lines.push(
  `- Branch: ${branch ?? '?'}; not committed: ${dirty.length ? dirty.join(', ') : 'nothing'}`,
);
run('git', ['fetch', '-q', 'origin', 'main'], 20_000);
const elsewhere = run('git', ['log', '--oneline', 'main..origin/main']);
lines.push(
  elsewhere
    ? `- origin/main has commits this computer has not (merge before a deploy):\n${elsewhere}`
    : '- main is up to date with origin/main',
);

// CI of main.
const ci = existsSync(GH)
  ? run(GH, [
      'run',
      'list',
      '--branch',
      'main',
      '--limit',
      '3',
      '--json',
      'workflowName,conclusion,status,headSha',
      '--jq',
      '.[] | "\\(.workflowName) \\(.headSha[0:7]): \\(.conclusion // .status)"',
    ])
  : null;
lines.push(
  ci
    ? `- CI of main:\n${ci}`
    : '- CI of main: unknown (gh missing or signed out)',
);

// The commit the server runs: its IMAGE in /opt/dashboard/.env.
const env = join(ROOT, 'deploy', 'deploy.local.env');
const settings = existsSync(env) ? readFileSync(env, 'utf8') : '';
const setting = name =>
  new RegExp(`^${name}=["']?([^"'\\n]+)`, 'm').exec(settings)?.[1]?.trim();
const host = setting('DEPLOY_HOST');
// As deploy.sh takes it: $HOME in the file is this user's home.
const key = (
  setting('DEPLOY_SSH_KEY') ?? join('$HOME', '.ssh', 'id_ed25519')
).replace(/^\$HOME|^~/, homedir());
const image = host
  ? run('ssh', [
      '-i',
      key,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=8',
      host,
      "grep -E '^IMAGE=' /opt/dashboard/.env | cut -d= -f2-",
    ])
  : null;
lines.push(`- The server runs: ${image ?? 'unknown (no SSH)'}`);

lines.push(
  '- The owner\'s open bugs: look at the task "Баги дашборда" and the nearest reminders through the personal-dashboard MCP (tasks_list, reminders_list) before starting.',
);

console.log(lines.join('\n'));
