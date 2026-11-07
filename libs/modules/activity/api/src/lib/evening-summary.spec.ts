import {ActivityStats} from '@pd/contracts';
import {activityMessages} from './activity.messages';
import {isSummaryDue, summaryOf} from './evening-summary';

describe('isSummaryDue', () => {
  it('comes once a day, from the chosen time on', () => {
    expect(
      isSummaryDue('21:00', '2026-10-02', {date: '2026-10-03', time: '20:55'}),
    ).toBe(false);
    expect(
      isSummaryDue('21:00', '2026-10-02', {date: '2026-10-03', time: '21:05'}),
    ).toBe(true);
    expect(
      isSummaryDue('21:00', '2026-10-03', {date: '2026-10-03', time: '22:00'}),
    ).toBe(false);
    expect(isSummaryDue(null, null, {date: '2026-10-03', time: '22:00'})).toBe(
      false,
    );
  });
});

describe('summaryOf', () => {
  const stats = (totalSeconds: number) =>
    ({
      totalSeconds,
      categories: [
        {category: 'development', seconds: 3000},
        {category: 'games', seconds: 2000},
        {category: 'browsing', seconds: 500},
        {category: 'media', seconds: 100},
      ],
    }) as ActivityStats;

  it('sums up a day with some time at the computer, the top three categories', () => {
    const summary = summaryOf(stats(5600), {completed: 2, seconds: 3000}, []);
    expect(summary?.categories.map(c => c.category)).toEqual([
      'development',
      'games',
      'browsing',
    ]);
  });

  it('tells how many numbers are above usual, in the right Russian form', () => {
    const summary = (unusual: number | null) =>
      summaryOf(
        stats(5600),
        {completed: 0, seconds: 0},
        [],
        {deepWork: null, draining: null},
        unusual,
      );
    const ru = activityMessages('ru');
    expect(ru.summaryBody(summary(1)!)).toContain('1 число');
    expect(ru.summaryBody(summary(3)!)).toContain('3 числа');
    expect(ru.summaryBody(summary(11)!)).toContain('11 чисел');
    expect(activityMessages('en').summaryBody(summary(2)!)).toContain(
      'Above usual today: 2 numbers',
    );
    expect(ru.summaryBody(summary(0)!)).not.toContain('обычного');
  });

  it("tells tomorrow's trusted forecasts, the bedtime as a clock", () => {
    const summary = summaryOf(
      stats(5600),
      {completed: 0, seconds: 0},
      [],
      {deepWork: null, draining: null},
      null,
      {bedtime: 24.67, deepWork: 2, tasks: 3.4},
    )!;
    expect(activityMessages('ru').summaryBody(summary)).toContain(
      'Завтра, похоже: отбой ~00:40 · глубокая работа ~2 ч 0 мин · сделано задач ~3',
    );
    expect(activityMessages('en').summaryBody(summary)).toContain(
      'Tomorrow, likely: bedtime ~00:40',
    );
    const none = summaryOf(
      stats(5600),
      {completed: 0, seconds: 0},
      [],
      undefined,
      null,
      {},
    )!;
    expect(none.tomorrow).toBeNull();
    expect(activityMessages('ru').summaryBody(none)).not.toContain('Завтра');
  });

  it('skips a day with almost nothing', () => {
    expect(summaryOf(stats(300), {completed: 0, seconds: 0}, [])).toBeNull();
  });
});
