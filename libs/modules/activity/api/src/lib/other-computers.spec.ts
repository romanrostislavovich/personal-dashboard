import { ActivityStats } from '@pd/contracts';
import { otherComputers, OtherComputerTime, withOtherComputers } from './other-computers';

const time = (computer: string, day: string, hours: number): OtherComputerTime => ({
  computer,
  source: 'wakatime',
  day,
  seconds: hours * 3600,
});

const times = [
  time('LRR', '2026-10-06', 2),
  time('LRR', '2026-10-07', 1),
  time('work-mac', '2026-10-06', 1),
  time('work-mac', '2026-10-07', 0.5),
];

describe('otherComputers', () => {
  it('counts a computer without the tracker and leaves out the one that has it', () => {
    expect(otherComputers(times, ['lrr'], [])).toEqual([
      { computer: 'LRR', source: 'wakatime', seconds: 3 * 3600, counted: false, reason: 'tracked' },
      { computer: 'work-mac', source: 'wakatime', seconds: 5400, counted: true, reason: null },
    ]);
  });

  it('leaves out a computer the user switched off', () => {
    const [, work] = otherComputers(times, ['LRR'], ['Work-Mac']);
    expect(work).toMatchObject({ counted: false, reason: 'off' });
  });
});

const tracked: ActivityStats = {
  totalSeconds: 8 * 3600,
  days: [
    { day: '2026-10-05', seconds: 0 },
    { day: '2026-10-06', seconds: 5 * 3600 },
    { day: '2026-10-07', seconds: 3 * 3600 },
  ],
  apps: [],
  categories: [
    { category: 'browsing', seconds: 5 * 3600 },
    { category: 'development', seconds: 3 * 3600 },
  ],
  projects: [],
  devices: [{ id: 'pc', name: 'LRR', seconds: 8 * 3600 }],
  titles: [],
  otherComputers: [],
};

describe('withOtherComputers', () => {
  it('adds the time of the counted computers to the total, the days and development', () => {
    const merged = withOtherComputers(tracked, times, otherComputers(times, ['LRR'], []));
    expect(merged.totalSeconds).toBe(9.5 * 3600);
    expect(merged.days).toEqual([
      { day: '2026-10-05', seconds: 0 },
      { day: '2026-10-06', seconds: 6 * 3600 },
      { day: '2026-10-07', seconds: 3.5 * 3600 },
    ]);
    expect(merged.categories).toEqual([
      { category: 'browsing', seconds: 5 * 3600 },
      { category: 'development', seconds: 4.5 * 3600 },
    ]);
    expect(merged.otherComputers).toEqual([
      { computer: 'work-mac', source: 'wakatime', seconds: 5400 },
    ]);
    // The tracker's own computer is as it was: its time is not counted twice.
    expect(merged.devices).toEqual(tracked.devices);
  });

  it('changes nothing when every computer has the tracker or is switched off', () => {
    const merged = withOtherComputers(tracked, times, otherComputers(times, ['LRR'], ['work-mac']));
    expect(merged).toEqual(tracked);
  });

  it('starts development when the tracker saw none', () => {
    const noCode = { ...tracked, categories: [{ category: 'browsing' as const, seconds: 100 }] };
    const merged = withOtherComputers(noCode, times, otherComputers(times, ['LRR'], []));
    expect(merged.categories).toEqual([
      { category: 'development', seconds: 5400 },
      { category: 'browsing', seconds: 100 },
    ]);
  });
});
