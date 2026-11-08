import {DailyMetric, LocalDate} from '@pd/contracts';
import {daysOf, shift} from '../daily-series';
import {lapseChance} from './lapse';
import {overloadHistory, overloadOn, overloadThreshold} from './overload';

const TODAY = '2026-11-07';
const DAYS = daysOf({from: shift(TODAY, -150), to: TODAY}) as LocalDate[];

function metric(
  key: string,
  value: (day: LocalDate, index: number) => number,
  unit: DailyMetric['unit'] = 'hours',
): DailyMetric {
  return {
    key,
    module: key.split('.')[0],
    labelKey: key,
    unit,
    days: DAYS.map((day, index) => ({day, value: value(day, index)})),
  };
}

/** Calm months, and the last five days heavy: more night phone, less sleep, a lower mood. */
function life(heavy: boolean): DailyMetric[] {
  const late = (day: LocalDate) => heavy && day > shift(TODAY, -5);
  return [
    metric('activity.phone.night', (day, i) =>
      late(day) ? 2.5 : 0.5 + (i % 4) / 10,
    ),
    metric('health.band.sleep', (day, i) =>
      late(day) ? 5 : 7.5 + (i % 3) / 10,
    ),
    metric(
      'diary.mood',
      (day, i) => (late(day) ? 2 : 4 - (i % 2) / 2),
      'score',
    ),
    metric('activity.index.deepWork', (_, i) => 2 + (i % 5) / 5),
  ];
}

describe('the overload score', () => {
  it('is high when the last days are heavier than usual, and tells what pulls it', () => {
    const heavy = overloadOn(life(true), TODAY);
    expect(heavy?.score).toBeGreaterThan(1.5);
    expect(heavy?.parts[0].key).not.toBe('activity.index.deepWork');
    expect(
      heavy?.parts.find(one => one.key === 'health.band.sleep')?.recent,
    ).toBe(5);
    const calm = overloadOn(life(false), TODAY);
    expect(Math.abs(calm?.score ?? 9)).toBeLessThan(0.75);
  });

  it("takes the user's own high from the past scores, never too low", () => {
    const history = overloadHistory(life(true), shift(TODAY, -100), TODAY);
    const threshold = overloadThreshold(
      history.slice(0, -7).map(one => one.score),
    );
    expect(threshold).not.toBeNull();
    expect(threshold as number).toBeGreaterThanOrEqual(0.75);
    expect(history[history.length - 1].score).toBeGreaterThan(
      threshold as number,
    );
    expect(overloadThreshold([1, 2])).toBeNull();
  });

  it('says nothing with too few signals', () => {
    expect(overloadOn(life(true).slice(0, 2), TODAY)).toBeNull();
  });
});

describe('the chance a habit lapses', () => {
  // The gym is skipped on the day after a late night of games.
  const games = metric('activity.lateGames', (_, i) => (i % 3 === 0 ? 2 : 0));
  const gym = metric(
    'habits.gym',
    (_, i) => (i > 0 && (i - 1) % 3 === 0 ? 0 : 1),
    'count',
  );

  it('is high the evening of a late game, when the model beats the usual rate', () => {
    // Today (index 150) is a late game: 150 % 3 === 0.
    const chance = lapseChance([games, gym], gym, 'unmarked', TODAY);
    expect(chance.trusted).toBe(true);
    expect(chance.chance).toBeGreaterThan(0.8);
    expect(chance.high).toBe(true);
    expect(chance.drivers[0].key).toBe('activity.lateGames');
  });

  it('is low on a quiet evening', () => {
    const quiet = lapseChance([games, gym], gym, 'unmarked', shift(TODAY, -1));
    expect(quiet.high).toBe(false);
  });

  it('waits for enough lapses', () => {
    const always = metric('habits.walk', () => 1, 'count');
    expect(
      lapseChance([games, always], always, 'unmarked', TODAY).chance,
    ).toBeNull();
  });

  it('does not learn from today: a daily habit not marked yet this evening is no lapse', () => {
    // Every day kept, but today not marked yet (0): learnt from, it would be a lapse.
    const kept = metric(
      'habits.read',
      (_, i) => (i === DAYS.length - 1 ? 0 : i % 4 === 0 ? 0 : 1),
      'count',
    );
    const before = lapseChance([games, kept], kept, 'unmarked', TODAY);
    const allKept = metric(
      'habits.read',
      (_, i) => (i % 4 === 0 ? 0 : 1),
      'count',
    );
    const after = lapseChance([games, allKept], allKept, 'unmarked', TODAY);
    expect(before.days).toBe(after.days);
    expect(before.usual).toBe(after.usual);
  });
});
