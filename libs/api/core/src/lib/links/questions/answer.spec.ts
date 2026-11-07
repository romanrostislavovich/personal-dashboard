import {LocalDate} from '@pd/contracts';
import {daysOf, Series, shift} from '../daily-series';
import {answerDays, MIN_DAYS, Strata} from './answer';
import {directionOf} from './insights.service';

const DAYS = daysOf({from: '2026-06-01', to: '2026-08-29'}) as LocalDate[];
const weekend = (day: LocalDate) =>
  [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
const strata = (more: Partial<Strata> = {}): Strata => ({
  weekend,
  rain: () => undefined,
  illness: () => false,
  travel: () => false,
  ...more,
});
const series = (value: (day: LocalDate, index: number) => number): Series =>
  new Map(DAYS.map((day, index) => [day, value(day, index)]));

describe('the answer to a question', () => {
  it('tells the next day of more of the cause against less, and that it holds', () => {
    // Late phone on odd days; the next day's deep work is an hour less after them.
    const phone = series((_, index) => (index % 2 ? 2 : 0.2));
    const deep = series((day, index) => {
      const before = DAYS[index - 1];
      return before && phone.get(before) === 2 ? 1 + (index % 3) / 10 : 2;
    });
    const answer = answerDays(phone, deep, 1, strata());
    expect(answer.status).toBe('answered');
    expect(answer.difference).toBeLessThan(-0.8);
    expect(answer.strong).toBe(true);
    expect(
      answer.confounders.find(one => one.confounder === 'weekend')?.holds,
    ).toBe(true);
    // Rain was never known: not checked.
    expect(
      answer.confounders.find(one => one.confounder === 'rain')?.holds,
    ).toBeNull();
  });

  it('says a link is the weekends once they are held apart', () => {
    // More games and a better mood on weekends, but not within weekdays or weekends.
    const games = series(
      day => (weekend(day) ? 3 : 0.5) + (day.length % 2) / 10,
    );
    const mood = series(
      (day, index) => (weekend(day) ? 4.5 : 3) + (index % 5) / 10,
    );
    const answer = answerDays(games, mood, 0, strata());
    expect(answer.strong).toBe(true);
    expect(
      answer.confounders.find(one => one.confounder === 'weekend')?.holds,
    ).not.toBe(true);
  });

  it('tells the difference only when the condition is high', () => {
    const sleep = series((_, index) => (index % 4 < 2 ? 5 : 8));
    const phone = series((_, index) => (index % 2 ? 2 : 0));
    // Late phone costs focus only after a short night.
    const focus = series((day, index) =>
      sleep.get(day) === 5 && phone.get(day) === 2 ? 1 : 3 + (index % 3) / 10,
    );
    const answer = answerDays(phone, focus, 0, strata(), sleep);
    expect(answer.condition?.whenLow).toBeLessThan(-1.5);
    expect(Math.abs(answer.condition?.whenHigh ?? 9)).toBeLessThan(0.5);
  });

  it('waits for enough days', () => {
    const few = new Map(DAYS.slice(0, MIN_DAYS - 1).map(day => [day, 1]));
    const answer = answerDays(few, few, 0, strata());
    expect(answer.status).toBe('few');
    expect(answer.n).toBe(MIN_DAYS - 2 + 1);
    expect(shift(DAYS[0], 1)).toBe(DAYS[1]);
  });

  it('puts the night before the day and what is done before what a day gives', () => {
    const outcome = (key: string) =>
      ['diary.mood', 'health.band.sleep', 'tasks.done'].includes(key);
    expect(directionOf('diary.mood', 'health.band.sleep', 0, outcome)).toEqual([
      'health.band.sleep',
      'diary.mood',
    ]);
    expect(
      directionOf('tasks.done', 'activity.phone.night', 0, outcome),
    ).toEqual(['activity.phone.night', 'tasks.done']);
    // The next day's number is the effect, whatever it is.
    expect(directionOf('diary.mood', 'health.band.sleep', 1, outcome)).toEqual([
      'diary.mood',
      'health.band.sleep',
    ]);
  });
});
