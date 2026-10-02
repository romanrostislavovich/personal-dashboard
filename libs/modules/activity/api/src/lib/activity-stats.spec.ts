import {
  buildRecords,
  buildStats,
  daysOf,
  longestRun,
  matchProject,
  UsageRow,
} from './activity-stats';

const projects = [
  { projectId: 'p1', name: 'Dashboard', patterns: ['Dashboard', 'personal-dashboard'] },
  { projectId: 'p2', name: 'Dashboard API', patterns: ['dashboard-api'] },
];

describe('matchProject', () => {
  it('finds the project by its name or a rule, whatever the case', () => {
    expect(matchProject('main.ts — personal-dashboard — Visual Studio Code', projects)).toBe('p1');
    expect(matchProject('DASHBOARD — Figma', projects)).toBe('p1');
    expect(matchProject('YouTube', projects)).toBeNull();
  });

  it('prefers the longer pattern', () => {
    expect(matchProject('server.ts — dashboard-api', projects)).toBe('p2');
  });

  it('ignores a pattern too short to mean anything', () => {
    expect(matchProject('a', [{ projectId: 'p', name: 'a', patterns: ['a'] }])).toBeNull();
  });
});

describe('daysOf', () => {
  it('lists every day of a period across a month border', () => {
    expect(daysOf('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('buildStats', () => {
  const row = (day: string, app: string, title: string, seconds: number, deviceId = 'd1') =>
    ({ day, deviceId, app, appName: app.toUpperCase(), title, seconds }) satisfies UsageRow;

  const stats = buildStats(
    [
      row('2026-10-01', 'code', 'main.ts — personal-dashboard', 3600),
      row('2026-10-01', 'chrome', 'YouTube', 1200),
      row('2026-10-02', 'chrome', 'YouTube', 600, 'd2'),
      row('2026-10-02', 'wow', 'World of Warcraft', 1800),
    ],
    { from: '2026-10-01', to: '2026-10-03' },
    {
      // The user moved the browser to "media".
      categories: new Map([['chrome', 'media']]),
      projects,
      devices: [
        { id: 'd1', name: 'PC' },
        { id: 'd2', name: 'Laptop' },
      ],
    },
  );

  it('adds the time up by day, with the empty days', () => {
    expect(stats.totalSeconds).toBe(7200);
    expect(stats.days).toEqual([
      { day: '2026-10-01', seconds: 4800 },
      { day: '2026-10-02', seconds: 2400 },
      { day: '2026-10-03', seconds: 0 },
    ]);
  });

  it('ranks programs, categories, projects, devices and titles', () => {
    expect(stats.apps.map((app) => `${app.app}:${app.category}:${app.seconds}`)).toEqual([
      'code:development:3600',
      'chrome:media:1800',
      'wow:games:1800',
    ]);
    expect(stats.categories).toEqual([
      { category: 'development', seconds: 3600 },
      { category: 'games', seconds: 1800 },
      { category: 'media', seconds: 1800 },
    ]);
    expect(stats.projects).toEqual([{ projectId: 'p1', name: 'Dashboard', seconds: 3600 }]);
    expect(stats.devices).toEqual([
      { id: 'd1', name: 'PC', seconds: 6600 },
      { id: 'd2', name: 'Laptop', seconds: 600 },
    ]);
    expect(stats.titles[1]).toMatchObject({ app: 'chrome', title: 'YouTube', seconds: 1800 });
  });
});

describe('buildRecords', () => {
  const records = buildRecords(
    [
      { day: '2026-09-30', app: 'code', seconds: 7200 },
      { day: '2026-10-01', app: 'code', seconds: 3600 },
      { day: '2026-10-01', app: 'chrome', seconds: 1800 },
      { day: '2026-10-03', app: 'wow', seconds: 600 },
    ],
    new Map([['chrome', 'development']]),
  );

  it("adds up the time in total and per category, the user's choice first", () => {
    expect(records.totalSeconds).toBe(13200);
    expect(records.byCategory.get('development')).toBe(12600);
    expect(records.byCategory.get('games')).toBe(600);
    expect(records.apps).toBe(3);
  });

  it('finds the days, the streak and the best days', () => {
    expect(records.activeDays).toBe(3);
    expect(records.longestStreak).toBe(2);
    expect(records.bestDaySeconds).toBe(7200);
    expect(records.bestDevelopmentDaySeconds).toBe(7200);
  });
});

describe('longestRun', () => {
  it('counts days in a row across a month border', () => {
    expect(longestRun(['2026-10-01', '2026-09-30', '2026-09-29', '2026-10-05'])).toBe(3);
    expect(longestRun([])).toBe(0);
  });
});
