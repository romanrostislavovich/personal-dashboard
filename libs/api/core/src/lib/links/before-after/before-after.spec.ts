import {
  addDays,
  DailyMetric,
  parseLocalDate,
  TimelinePeriod,
  toLocalDate,
} from '@pd/contracts';
import {beforeAfter, eventsOf} from './before-after';

const FROM = '2025-01-01';
const DAYS = 400;
const day = (index: number) =>
  toLocalDate(addDays(parseLocalDate(FROM), index));
const range = {from: FROM, to: day(DAYS - 1)};

function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31 - 0.5;
  };
}

function metric(
  key: string,
  values: number[],
  unit: DailyMetric['unit'] = 'hours',
): DailyMetric {
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit,
    days: values.map((value, index) => ({day: day(index), value})),
  };
}

const period = (from: string, to: string | null = null): TimelinePeriod => ({
  module: 'health',
  kind: 'diagnosis',
  title: 'F32 Depressive episode',
  subtitle: null,
  from,
  to,
});

const random = noise(5);
const EVENT = 300;
// After the event: games late at night go up; the coding stays as it was.
const lateGames = Array.from({length: DAYS}, (_, i) =>
  Math.max(0, (i >= EVENT ? 2.5 : 0.8) + random()),
);
const coding = Array.from({length: DAYS}, () => 4 + 2 * random());
// The music follows the seasons only.
const music = Array.from(
  {length: DAYS},
  (_, i) => 20 + 6 * Math.sin((2 * Math.PI * i) / 365) + 8 * random(),
);
const temperature = Array.from(
  {length: DAYS},
  (_, i) => 10 + 10 * Math.sin((2 * Math.PI * i) / 365),
);

const result = beforeAfter(
  [
    metric('activity.lateGames', lateGames),
    metric('development.coding', coding),
    metric('music.plays', music, 'count'),
    metric('weather.temperature', temperature, 'degrees'),
  ],
  [period(day(EVENT))],
  range,
  4,
);
const [around] = result.results;
const change = (key: string) => around.changes.find(one => one.key === key);

describe('beforeAfter', () => {
  it('finds a number that changed at the event', () => {
    expect(change('activity.lateGames')?.changed).toBe(true);
    expect(change('activity.lateGames')?.difference).toBeGreaterThan(1);
    expect(change('activity.lateGames')?.p).toBeLessThan(0.01);
    expect(around.changes[0].key).toBe('activity.lateGames');
  });

  it('calls a number that only lives its usual life unchanged', () => {
    expect(change('development.coding')?.changed).toBe(false);
    expect(change('music.plays')?.changed).toBe(false);
  });

  it('leaves the weather out: it is not the person', () => {
    expect(change('weather.temperature')).toBeUndefined();
  });

  it('gives the windows for the chart around the date', () => {
    const values = change('activity.lateGames')?.values ?? [];
    expect(values[0].day).toBe(day(EVENT - 28));
    expect(values.at(-1)?.day).toBe(day(EVENT + 27));
  });

  it('waits for enough days after a recent event', () => {
    const recent = beforeAfter(
      [metric('activity.lateGames', lateGames)],
      [period(day(DAYS - 3))],
      range,
      4,
    );
    expect(recent.results[0]).toMatchObject({
      enough: false,
      daysAfter: 3,
      changes: [],
    });
  });

  it('cannot tell without a history of ordinary dates', () => {
    // Only the weeks around the event: no ordinary dates to compare with.
    const around = {
      ...metric('activity.lateGames', []),
      days: lateGames
        .slice(260, 340)
        .map((value, i) => ({day: day(260 + i), value})),
    };
    const short = beforeAfter([around], [period(day(EVENT))], range, 4);
    expect(short.results[0].changes[0]?.p).toBeNull();
    expect(short.results[0].changes[0]?.changed).toBe(false);
  });
});

describe('eventsOf', () => {
  it('takes the starts and the ends that have come, the latest first', () => {
    const events = eventsOf(
      [
        period('2026-01-10', '2026-03-01'),
        {...period('2026-05-01', '2027-01-01'), kind: 'medication', title: 'X'},
      ],
      '2026-10-18',
    );
    expect(events.map(event => [event.on, event.edge])).toEqual([
      ['2026-05-01', 'start'],
      ['2026-03-01', 'end'],
      ['2026-01-10', 'start'],
    ]);
  });
});
