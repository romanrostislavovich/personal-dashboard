import { parseWhen } from './when';

// Friday 2 October 2026, 14:30 in Warsaw (UTC+2).
const NOW = new Date('2026-10-02T12:30:00Z');
const ZONE = 'Europe/Warsaw';

function when(text: string) {
  const parsed = parseWhen(text, NOW, ZONE);
  return parsed && { at: parsed.at.toISOString(), rest: parsed.rest };
}

describe('parseWhen', () => {
  it('counts from now for "in N units"', () => {
    expect(when('через 2 часа позвонить маме')).toEqual({
      at: '2026-10-02T14:30:00.000Z',
      rest: 'позвонить маме',
    });
    expect(when('in 15 min stand up')).toEqual({
      at: '2026-10-02T12:45:00.000Z',
      rest: 'stand up',
    });
    expect(when('через 3 дня оплатить')).toEqual({
      at: '2026-10-05T12:30:00.000Z',
      rest: 'оплатить',
    });
  });

  it("takes 09:00 on the user's clock when only the day is said", () => {
    expect(when('завтра купить молоко')).toEqual({
      at: '2026-10-03T07:00:00.000Z',
      rest: 'купить молоко',
    });
    expect(when('послезавтра')).toEqual({ at: '2026-10-04T07:00:00.000Z', rest: '' });
  });

  it('reads the time after the day, with or without "в"', () => {
    expect(when('завтра в 18:30 врач')).toEqual({ at: '2026-10-03T16:30:00.000Z', rest: 'врач' });
    expect(when('tomorrow at 7 run')).toEqual({ at: '2026-10-03T05:00:00.000Z', rest: 'run' });
    expect(when('сегодня 21.15 вынести мусор')).toEqual({
      at: '2026-10-02T19:15:00.000Z',
      rest: 'вынести мусор',
    });
  });

  it('reads dates, a past day of the year meaning the next year', () => {
    expect(when('05.10 9:00 собрание')).toEqual({
      at: '2026-10-05T07:00:00.000Z',
      rest: 'собрание',
    });
    expect(when('2026-12-24 18:00 ёлка')).toEqual({ at: '2026-12-24T17:00:00.000Z', rest: 'ёлка' });
    // 1 March has passed this year; Warsaw is UTC+1 in winter.
    expect(when('01.03 налоги')).toEqual({ at: '2027-03-01T08:00:00.000Z', rest: 'налоги' });
    expect(when('05.10.2027 отпуск')).toEqual({ at: '2027-10-05T07:00:00.000Z', rest: 'отпуск' });
  });

  it('puts a bare time on today, or on tomorrow when it has passed', () => {
    expect(when('18:00 ужин')).toEqual({ at: '2026-10-02T16:00:00.000Z', rest: 'ужин' });
    expect(when('в 9:00 зарядка')).toEqual({ at: '2026-10-03T07:00:00.000Z', rest: 'зарядка' });
  });

  it('gives nothing for a text without a time at its beginning', () => {
    expect(when('купить молоко')).toBeNull();
    expect(when('позвонить в 18:00')).toBeNull();
    expect(when('25:00 что-то')).toBeNull();
    expect(when('через пару часов')).toBeNull();
    expect(when('32.13 что-то')).toBeNull();
  });
});
