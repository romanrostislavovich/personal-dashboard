import { addDays, DailyMetric, LocalDate, parseLocalDate, toLocalDate } from '@pd/contracts';
import { correlations, WEEKEND_METRIC } from './correlations';

const FROM = '2026-01-01';
const DAYS = 120;
const day = (index: number): LocalDate => toLocalDate(addDays(parseLocalDate(FROM), index));
const period = { from: FROM, to: day(DAYS - 1) };

/** The same "random" days every run. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31 - 0.5;
  };
}

function metric(key: string, values: number[], extra: Partial<DailyMetric> = {}): DailyMetric {
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit: 'hours',
    days: values.map((value, index) => ({ day: day(index), value })),
    ...extra,
  };
}

const random = noise(7);
const games = Array.from({ length: DAYS }, () => Math.max(0, 2 + 3 * random()));
// The mood of a day falls after a night of games; coding of the same day has nothing to do with it.
const mood = games.map((_, index) => (index ? 4 - 0.8 * games[index - 1] + 0.5 * random() : 3));
const coding = Array.from({ length: DAYS }, () => 4 + 3 * random());
const lateGames = games.map((value) => value / 2);

const result = correlations(
  [
    metric('activity.games', games),
    metric('activity.lateGames', lateGames, { partOf: 'activity.games' }),
    metric('diary.mood', mood, { unit: 'score' }),
    metric('development.coding', coding),
  ],
  period,
);
const find = (a: string, b: string, lag: 0 | 1) =>
  result.correlations.find((pair) => pair.a === a && pair.b === b && pair.lag === lag);

describe('correlations', () => {
  it('finds what comes a day before', () => {
    const pair = find('activity.games', 'diary.mood', 1);
    expect(pair?.strong).toBe(true);
    expect(pair?.rho).toBeLessThan(-0.6);
    expect(pair?.slope).toBeLessThan(0);
    // Not because the mood of the day before says the same: the games tell more.
    expect(Math.abs(pair?.beyondItself ?? 0)).toBeGreaterThan(0.5);
  });

  it('calls numbers that have nothing to do with each other unlinked', () => {
    expect(find('development.coding', 'diary.mood', 0)?.strong).toBe(false);
    expect(find('development.coding', 'diary.mood', 1)?.strong).toBe(false);
  });

  it('never compares a number with a part of it', () => {
    expect(find('activity.games', 'activity.lateGames', 0)).toBeUndefined();
    expect(find('activity.lateGames', 'activity.games', 1)).toBeUndefined();
  });

  it('puts the strong links first', () => {
    const firstWeak = result.correlations.findIndex((pair) => !pair.strong);
    expect(result.correlations.slice(firstWeak).some((pair) => pair.strong)).toBe(false);
  });

  it('adds the weekends, only of the same day', () => {
    expect(result.metrics.some((item) => item.key === WEEKEND_METRIC)).toBe(true);
    expect(
      result.correlations.some(
        (pair) => pair.lag === 1 && (pair.a === WEEKEND_METRIC || pair.b === WEEKEND_METRIC),
      ),
    ).toBe(false);
  });

  it('explains the mood by the games of the day before', () => {
    expect(result.regression?.target).toBe('diary.mood');
    const [first] = result.regression?.terms ?? [];
    expect(first.key).toMatch(/^activity\./);
    expect(first.lag).toBe(1);
    expect(first.beta).toBeLessThan(0);
    expect(result.regression?.r2).toBeGreaterThan(0.6);
  });

  it('never explains by a number and a part of it together', () => {
    const terms = result.regression?.terms.map((term) => term.key) ?? [];
    expect(terms.includes('activity.games') && terms.includes('activity.lateGames')).toBe(false);
  });

  it('counts a quantity only from its first day to its last, its empty days as zero', () => {
    // Spending on every third day of days 30–89: the empty days between are days of zero.
    const spent: DailyMetric = {
      ...metric('finance.spent', []),
      unit: 'money',
      days: Array.from({ length: 20 }, (_, i) => ({ day: day(30 + i * 3), value: 10 })),
    };
    const counted = correlations([spent], period).metrics.find((m) => m.key === 'finance.spent');
    expect(counted?.days).toBe(58);
    expect(counted?.values[1]).toEqual({ day: day(31), value: 0 });
  });

  it('leaves out a number of too few days', () => {
    const few = correlations([metric('tasks.done', [1, 2, 3])], period);
    expect(few.metrics.map((item) => item.key)).toEqual([WEEKEND_METRIC]);
    expect(few.regression).toBeNull();
  });
});
