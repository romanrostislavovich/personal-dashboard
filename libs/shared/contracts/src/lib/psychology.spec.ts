import {
  compareEvents,
  eventSpan,
  eventTouches,
  psychologyEventInputSchema,
  PsychologyEvent,
} from './psychology';
import { LocalDate } from './local-date';

type Time = Pick<PsychologyEvent, 'startedOn' | 'endedOn' | 'ageFrom' | 'ageTo'>;

const dated = (startedOn: string, endedOn: string | null = null): Time => ({
  startedOn: startedOn as LocalDate,
  endedOn: endedOn as LocalDate | null,
  ageFrom: null,
  ageTo: null,
});
const aged = (ageFrom: number, ageTo: number | null = null): Time => ({
  startedOn: null,
  endedOn: null,
  ageFrom,
  ageTo,
});

describe('the time of an event', () => {
  it('takes dates or an age, never both and never neither', () => {
    const valid = (input: object) =>
      psychologyEventInputSchema.safeParse({ title: 'A move', ...input }).success;
    expect(valid({ startedOn: '2026-09-03' })).toBe(true);
    expect(valid({ ageFrom: 3 })).toBe(true);
    expect(valid({ ageFrom: 0 })).toBe(true);
    expect(valid({ ageFrom: 6, ageTo: 9 })).toBe(true);
    expect(valid({})).toBe(false);
    expect(valid({ startedOn: '2026-09-03', ageFrom: 3 })).toBe(false);
    expect(valid({ ageFrom: 9, ageTo: 6 })).toBe(false);
    expect(valid({ ageFrom: 3, endedOn: '2026-09-03' })).toBe(false);
    expect(valid({ ageFrom: 3.5 })).toBe(false);
  });

  it('covers the two calendar years a year of life lies across', () => {
    expect(eventSpan(aged(3), 1992)).toEqual({ from: '1995-01-01', to: '1996-12-31' });
    expect(eventSpan(aged(6, 9), 1992)).toEqual({ from: '1998-01-01', to: '2002-12-31' });
    expect(eventSpan(aged(3), null)).toBeNull();
    expect(eventSpan(dated('2026-09-03'), null)).toEqual({ from: '2026-09-03', to: '2026-09-03' });
  });

  it('keeps an event that cannot be placed in time out of a period, but not out of everything', () => {
    expect(eventTouches(aged(3), null, {})).toBe(true);
    expect(eventTouches(aged(3), null, { from: '1990-01-01' })).toBe(false);
    expect(eventTouches(aged(3), 1992, { from: '1996-06-01', to: '1996-06-30' })).toBe(true);
    expect(eventTouches(aged(3), 1992, { from: '1997-01-01' })).toBe(false);
    expect(eventTouches(dated('2026-09-03', '2026-09-10'), null, { from: '2026-09-10' })).toBe(
      true,
    );
    expect(eventTouches(dated('2026-09-03'), null, { to: '2026-09-02' })).toBe(false);
  });

  it('orders the latest first, an age standing where the year of birth puts it', () => {
    const events = [
      { name: 'school', createdAt: '1', ...aged(7) },
      { name: 'move', createdAt: '2', ...dated('2026-09-03') },
      { name: 'first job', createdAt: '3', ...dated('2012-05-01') },
      { name: 'university', createdAt: '4', ...aged(18, 22) },
    ];
    const order = (birthYear: number | null) =>
      [...events].sort(compareEvents(birthYear)).map((event) => event.name);
    expect(order(1992)).toEqual(['move', 'first job', 'university', 'school']);
    // Without the year of birth the ages come after the dates, the youngest last.
    expect(order(null)).toEqual(['move', 'first job', 'university', 'school']);
    expect(order(1980)).toEqual(['move', 'first job', 'university', 'school']);
    expect(order(2000)).toEqual(['move', 'university', 'first job', 'school']);
  });
});
