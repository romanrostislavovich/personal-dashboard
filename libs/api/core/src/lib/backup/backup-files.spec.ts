import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RestoreCheck } from '@pd/contracts';
import { backupProblems, listDumps, pruneDumps } from './backup-files';

const NOW = new Date('2026-09-30T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const dump = (hours: number) => ({
  name: 'dashboard-2026-09-30.dump',
  size: 1,
  createdAt: hoursAgo(hours),
});
const check = (hours: number, ok = true): RestoreCheck => ({
  checkedAt: hoursAgo(hours),
  dump: 'dashboard-2026-09-30.dump',
  ok,
  error: null,
  tables: 28,
  rows: 1000,
  mismatches: [],
});

describe('backupProblems', () => {
  it('a fresh dump with a recent good check is fine', () => {
    expect(backupProblems('server', dump(3), check(24), NOW)).toEqual([]);
  });

  it('reports a missing or old dump', () => {
    expect(backupProblems('server', null, check(1), NOW)).toEqual(['missing']);
    expect(backupProblems('server', dump(30), check(1), NOW)).toEqual(['stale']);
  });

  it('gives the computer a few days: it is not always on', () => {
    expect(backupProblems('client', dump(30), null, NOW)).toEqual([]);
    expect(backupProblems('client', dump(24 * 5), null, NOW)).toEqual(['stale']);
  });

  it('reports a failed or overdue test restore', () => {
    expect(backupProblems('server', dump(1), check(1, false), NOW)).toEqual(['restore-failed']);
    expect(backupProblems('server', dump(1), check(24 * 9), NOW)).toEqual(['unchecked']);
    expect(backupProblems('server', dump(1), null, NOW)).toEqual(['unchecked']);
    expect(backupProblems('client', dump(1), check(1, false), NOW)).toEqual(['restore-failed']);
  });
});

describe('listDumps / pruneDumps', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'pd-backups-'));
  });

  afterEach(() => rm(folder, { recursive: true, force: true }));

  it('lists dumps newest first, ignores other files, keeps the newest ones', async () => {
    for (const day of ['2026-09-28', '2026-09-30', '2026-09-29']) {
      await writeFile(join(folder, `dashboard-${day}.dump`), 'PGDMP');
    }
    await writeFile(join(folder, 'dashboard-2026-09-30.dump.tmp'), '');
    await writeFile(join(folder, 'restore-check.json'), '{}');
    const old = new Date('2026-09-28T03:00:00Z');
    await utimes(join(folder, 'dashboard-2026-09-28.dump'), old, old);

    const dumps = await listDumps(folder);
    expect(dumps.map((d) => d.name)).toEqual([
      'dashboard-2026-09-30.dump',
      'dashboard-2026-09-29.dump',
      'dashboard-2026-09-28.dump',
    ]);
    expect(dumps[2]).toMatchObject({ size: 5, createdAt: old.toISOString() });

    await pruneDumps(folder, 2);
    expect((await listDumps(folder)).map((d) => d.name)).toEqual([
      'dashboard-2026-09-30.dump',
      'dashboard-2026-09-29.dump',
    ]);
  });

  it('a missing folder has no dumps', async () => {
    expect(await listDumps(join(folder, 'nope'))).toEqual([]);
  });
});
