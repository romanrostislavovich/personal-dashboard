import {ActivityStats} from '@pd/contracts';
import {
  otherComputers,
  OtherComputerTime,
  timeByClock,
  withOtherComputers,
} from './other-computers';
import {dayBounds} from './time-spans';

const time = (
  computer: string,
  day: string,
  hours: number,
): OtherComputerTime => ({
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
      {
        computer: 'LRR',
        source: 'wakatime',
        seconds: 3 * 3600,
        counted: false,
        reason: 'tracked',
      },
      {
        computer: 'work-mac',
        source: 'wakatime',
        seconds: 5400,
        counted: true,
        reason: null,
      },
    ]);
  });

  it('leaves out a computer the user switched off', () => {
    const [, work] = otherComputers(times, ['LRR'], ['Work-Mac']);
    expect(work).toMatchObject({counted: false, reason: 'off'});
  });
});

const tracked: ActivityStats = {
  totalSeconds: 8 * 3600,
  days: [
    {day: '2026-10-05', seconds: 0},
    {day: '2026-10-06', seconds: 5 * 3600},
    {day: '2026-10-07', seconds: 3 * 3600},
  ],
  apps: [],
  categories: [
    {category: 'browsing', seconds: 5 * 3600},
    {category: 'development', seconds: 3 * 3600},
  ],
  projects: [],
  devices: [{id: 'pc', name: 'LRR', seconds: 8 * 3600}],
  titles: [],
  otherComputers: [],
};

describe('withOtherComputers', () => {
  it('adds the time of the counted computers to the total, the days and development', () => {
    const merged = withOtherComputers(
      tracked,
      times,
      otherComputers(times, ['LRR'], []),
    );
    expect(merged.totalSeconds).toBe(9.5 * 3600);
    expect(merged.days).toEqual([
      {day: '2026-10-05', seconds: 0},
      {day: '2026-10-06', seconds: 6 * 3600},
      {day: '2026-10-07', seconds: 3.5 * 3600},
    ]);
    expect(merged.categories).toEqual([
      {category: 'browsing', seconds: 5 * 3600},
      {category: 'development', seconds: 4.5 * 3600},
    ]);
    expect(merged.otherComputers).toEqual([
      {computer: 'work-mac', source: 'wakatime', seconds: 5400},
    ]);
    // The tracker's own computer is as it was: its time is not counted twice.
    expect(merged.devices).toEqual(tracked.devices);
  });

  it('changes nothing when every computer has the tracker or is switched off', () => {
    const merged = withOtherComputers(
      tracked,
      times,
      otherComputers(times, ['LRR'], ['work-mac']),
    );
    expect(merged).toEqual(tracked);
  });

  it('starts development when the tracker saw none', () => {
    const noCode = {
      ...tracked,
      categories: [{category: 'browsing' as const, seconds: 100}],
    };
    const merged = withOtherComputers(
      noCode,
      times,
      otherComputers(times, ['LRR'], []),
    );
    expect(merged.categories).toEqual([
      {category: 'development', seconds: 5400},
      {category: 'browsing', seconds: 100},
    ]);
  });

  it('adds of the games of Steam only what the tracker has not seen itself', () => {
    const steam = (day: string, hours: number): OtherComputerTime => ({
      computer: 'Steam',
      source: 'steam',
      day,
      seconds: hours * 3600,
      category: 'games',
    });
    // The 6th: three hours on Steam, two of them seen by the tracker. The 7th: all seen.
    const played = [steam('2026-10-06', 3), steam('2026-10-07', 1)];
    const trackedGames = new Map([
      ['2026-10-06', 2 * 3600],
      ['2026-10-07', 1.5 * 3600],
    ]);
    const merged = withOtherComputers(
      tracked,
      played,
      otherComputers(played, ['LRR'], []),
      trackedGames,
    );
    expect(merged.totalSeconds).toBe(9 * 3600);
    expect(merged.days[1]).toEqual({day: '2026-10-06', seconds: 6 * 3600});
    expect(merged.days[2]).toEqual({day: '2026-10-07', seconds: 3 * 3600});
    expect(merged.categories).toContainEqual({
      category: 'games',
      seconds: 3600,
    });
    expect(merged.otherComputers).toEqual([
      {computer: 'Steam', source: 'steam', seconds: 3600},
    ]);
  });
});

describe('timeByClock', () => {
  const days = dayBounds({from: '2026-10-06', to: '2026-10-06'}, 'UTC');
  const at = (time: string) => Date.parse(`2026-10-06T${time}:00Z`);
  const span = (from: string, to: string) => ({start: at(from), end: at(to)});

  it('counts what overlaps once: the tracker, then the laptop, then the browser', () => {
    const times = timeByClock({
      // The desktop computer 09:00–11:00.
      tracker: [span('09:00', '11:00')],
      // WakaTime on the laptop 10:00–13:00: 11:00–13:00 is new.
      computers: [
        {
          computer: 'work-mac',
          source: 'wakatime',
          spans: [span('10:00', '13:00')],
        },
      ],
      // The browser 09:30–10:00 (on the desktop) and 12:30–14:00 (on the laptop): 13:00–14:00.
      browser: [span('09:30', '10:00'), span('12:30', '14:00')],
      days,
    });
    expect(times).toEqual([
      {
        computer: 'work-mac',
        source: 'wakatime',
        day: '2026-10-06',
        seconds: 2 * 3600,
      },
      {
        computer: 'browser',
        source: 'extension',
        day: '2026-10-06',
        seconds: 3600,
        category: 'browsing',
      },
    ]);
  });

  it('adds nothing when the tracker saw all of it', () => {
    expect(
      timeByClock({
        tracker: [span('09:00', '18:00')],
        computers: [],
        browser: [span('10:00', '11:00')],
        days,
      }),
    ).toEqual([]);
  });
});
