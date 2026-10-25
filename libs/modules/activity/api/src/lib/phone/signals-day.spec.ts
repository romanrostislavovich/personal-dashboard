import { clock, hoursOf, Signal, signalsDays } from './signals-day';

const H = 3_600_000;
const MIN = 60_000;
/** The 20th, local midnight at 0 for simplicity. */
const DAY = { day: '2026-10-20', start: 0, end: 24 * H };

function s(kind: string, at: number, data: Record<string, unknown> | null = null): Signal {
  return { kind, at, data };
}

describe("the phone's signals of a day", () => {
  it('tells the first use, the last one, and the longest rest of the night', () => {
    const [day] = signalsDays(
      [DAY],
      [
        s('screenOff', -1 * H), // 23:00 the evening before
        s('screenOn', 7 * H + 15 * MIN), // 07:15
        s('screenOff', 7 * H + 30 * MIN),
        s('screenOn', 12 * H),
        s('screenOff', 24 * H + 30 * MIN), // 00:30 the night after: still this day's
      ],
      new Map(),
      48 * H,
    );
    expect(day.firstUse).toBe('07:15');
    expect(day.lastUse).toBe('24:30');
    expect(day.restHours).toBe(8.3);
  });

  it('counts the time with headphones, in the car, playing and in Do Not Disturb', () => {
    const [day] = signalsDays(
      [DAY],
      [
        s('bluetooth', 8 * H, { connected: true, kind: 'headphones', name: 'Buds' }),
        s('bluetooth', 9 * H, { connected: false, kind: 'headphones', name: 'Buds' }),
        s('bluetooth', 18 * H, { connected: true, kind: 'car', name: 'Car' }),
        s('bluetooth', 18 * H + 30 * MIN, { connected: false, kind: 'car', name: 'Car' }),
        s('media', 8 * H, { app: 'spotify', playing: true }),
        s('media', 8 * H + 45 * MIN, { app: 'spotify', playing: false }),
        s('dnd', 22 * H, { on: true }),
      ],
      new Map(),
      23 * H,
    );
    expect(day).toMatchObject({ headphonesHours: 1, carHours: 0.5, mediaHours: 0.8, dndHours: 1 });
  });

  it('counts calls, minutes and people; a quiet day of a counted kind is 0, an untold day null', () => {
    const call = (at: number, seconds: number, who: string) =>
      s('call', at, { seconds, who, type: 'out' });
    const days = signalsDays(
      [
        DAY,
        { day: '2026-10-21', start: 24 * H, end: 48 * H },
        { day: '2026-10-22', start: 48 * H, end: 72 * H },
      ],
      [
        call(10 * H, 120, 'a1'),
        call(11 * H, 60, 'a1'),
        call(12 * H, 30, 'b2'),
        s('screenOn', 30 * H), // the 21st: the phone told something, no calls
      ],
      new Map([['2026-10-20', { steps: 8123, mobileBytes: 52_400_000 }]]),
      72 * H,
    );
    expect(days[0]).toMatchObject({
      calls: 3,
      callMinutes: 3.5,
      people: 2,
      steps: 8123,
      mobileMegabytes: 52.4,
    });
    expect(days[1]).toMatchObject({ calls: 0, people: 0 });
    expect(days[2]).toMatchObject({ calls: null, steps: null, firstUse: null });
  });

  it('averages the noise and counts the daylight samples', () => {
    const [day] = signalsDays(
      [DAY],
      [
        s('noise', 9 * H, { db: 40 }),
        s('noise', 10 * H, { db: 60 }),
        s('light', 12 * H, { lux: 5000 }),
        s('light', 13 * H, { lux: 20 }),
      ],
      new Map(),
    );
    expect(day).toMatchObject({ noiseDb: 50, daylightHours: 0.3 });
  });

  it('writes and reads a clock past midnight', () => {
    expect(clock(25.5)).toBe('25:30');
    expect(hoursOf('07:15')).toBe(7.25);
    expect(hoursOf(null)).toBeNull();
  });
});
