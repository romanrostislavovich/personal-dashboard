import { buildFocusStats, LimitRow, lowDisks, reachedLimits } from './wellbeing-rules';

describe('reachedLimits', () => {
  const limit = (kind: LimitRow['kind'], minutes: number, app: string | null = null) =>
    ({ id: kind + app, kind, app, minutes, notifiedOn: null }) satisfies LimitRow;
  const today = new Map([
    ['wow', 2 * 3600],
    ['dota2', 3600],
    ['code', 4 * 3600],
  ]);
  const categoryOf = (app: string) => (app === 'code' ? 'development' : 'games') as const;

  it('adds up the games, the whole day and one program', () => {
    const reached = reachedLimits(
      [
        limit('games', 180),
        limit('total', 8 * 60),
        limit('app', 90, 'wow'),
        limit('app', 60, 'steam'),
      ],
      today,
      categoryOf,
      '2026-10-03',
    );
    expect(reached.map((r) => [r.limit.kind, r.limit.app, r.usedSeconds])).toEqual([
      ['games', null, 3 * 3600],
      ['app', 'wow', 2 * 3600],
    ]);
  });

  it('reports a limit once a day', () => {
    const reported = { ...limit('games', 60), notifiedOn: '2026-10-03' };
    expect(reachedLimits([reported], today, categoryOf, '2026-10-03')).toEqual([]);
    expect(reachedLimits([reported], today, categoryOf, '2026-10-04')).toHaveLength(1);
  });
});

describe('lowDisks', () => {
  it('finds disks with less than a tenth free', () => {
    const disks = lowDisks({
      at: '2026-10-03T12:00:00Z',
      cpu: 10,
      memoryUsed: 1,
      memoryTotal: 2,
      uptimeSeconds: 1,
      disks: [
        { mount: 'C:', total: 500, free: 40 },
        { mount: 'D:', total: 1000, free: 500 },
        { mount: 'E:', total: 0, free: 0 },
      ],
    });
    expect(disks.map((disk) => disk.mount)).toEqual(['C:']);
  });
});

describe('buildFocusStats', () => {
  const stats = buildFocusStats(
    [
      {
        day: '2026-10-02',
        projectId: 'p1',
        projectName: 'Dashboard',
        focusSeconds: 1500,
        completed: true,
        distractedSeconds: 60,
      },
      {
        day: '2026-10-03',
        projectId: 'p1',
        projectName: 'Dashboard',
        focusSeconds: 1500,
        completed: true,
        distractedSeconds: 0,
      },
      {
        day: '2026-10-03',
        projectId: null,
        projectName: null,
        focusSeconds: 600,
        completed: false,
        distractedSeconds: 120,
      },
    ],
    { from: '2026-10-01', to: '2026-10-03' },
    ['2026-10-01', '2026-10-02', '2026-10-03'],
    '2026-10-03',
  );

  it('adds up the time by day and project', () => {
    expect(stats.focusSeconds).toBe(3600);
    expect(stats.completed).toBe(2);
    expect(stats.distractedSeconds).toBe(180);
    expect(stats.days.map((day) => day.seconds)).toEqual([0, 1500, 2100]);
    expect(stats.projects[0]).toEqual({ projectId: 'p1', name: 'Dashboard', seconds: 3000 });
  });

  it('counts the days in a row with a completed session', () => {
    expect(stats.streak).toEqual({ current: 3, longest: 3 });
  });
});
