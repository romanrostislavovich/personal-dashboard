import { birthdayInputSchema, upcomingDates, UpcomingBirthday } from '@pd/contracts';
import { toUpcoming } from './birthdays.service';
import { birthdayMessages } from './birthdays.messages';
import { dueReminders } from './due-reminders';

const today = { year: 2026, month: 10, day: 7 };

/** A person as stored, with the defaults of the form. */
const person = (changes: Record<string, unknown>): UpcomingBirthday =>
  toUpcoming(
    {
      id: String(changes['name']),
      userId: 'me',
      name: 'Someone',
      month: null,
      day: null,
      year: null,
      note: null,
      remindDaysBefore: [0, 1, 7],
      deathMonth: null,
      deathDay: null,
      deathYear: null,
      memorialRemindDaysBefore: [0, 1],
      createdAt: new Date(),
      ...changes,
    } as never,
    today,
  );

const anna = person({ name: 'Anna', month: 10, day: 8, year: 1990 });
const grandfather = person({
  name: 'Grandfather',
  month: 10,
  day: 7,
  year: 1940,
  deathMonth: 10,
  deathDay: 8,
  deathYear: 2016,
});
const greatGrandmother = person({ name: 'Great-grandmother', deathMonth: 10, deathDay: 7 });

describe('toUpcoming', () => {
  it('counts the birthday and the day of memory apart', () => {
    expect(grandfather).toMatchObject({
      nextDate: '2026-10-07',
      daysUntil: 0,
      turningAge: 86,
      memorial: { nextDate: '2026-10-08', daysUntil: 1, years: 10 },
    });
  });

  it('leaves out what is not known', () => {
    expect(greatGrandmother).toMatchObject({
      nextDate: null,
      daysUntil: null,
      turningAge: null,
      memorial: { nextDate: '2026-10-07', daysUntil: 0, years: null },
    });
    expect(anna.memorial).toBeNull();
  });
});

describe('dueReminders', () => {
  const kinds = (people: UpcomingBirthday[]) =>
    dueReminders(people).map(({ kind, person: who }) => `${who.name}: ${kind}`);

  it('reminds of a birthday on the days chosen for it', () => {
    expect(kinds([anna])).toEqual(['Anna: birthday']);
    expect(kinds([person({ name: 'Later', month: 10, day: 20 })])).toEqual([]);
  });

  it('tells the birthday of someone who has died on the day only', () => {
    expect(kinds([grandfather])).toEqual([
      'Grandfather: birthday-in-memory',
      'Grandfather: memorial',
    ]);
    // A day before his birthday: nothing — there is nothing to prepare.
    const tomorrow = person({
      name: 'Grandmother',
      month: 10,
      day: 8,
      deathMonth: 3,
      deathDay: 1,
    });
    expect(kinds([tomorrow])).toEqual([]);
  });

  it('reminds of a day of memory on the day and the day before, unless set otherwise', () => {
    expect(kinds([greatGrandmother])).toEqual(['Great-grandmother: memorial']);
    const onTheDayOnly = person({
      name: 'Uncle',
      deathMonth: 10,
      deathDay: 8,
      memorialRemindDaysBefore: [0],
    });
    expect(kinds([onTheDayOnly])).toEqual([]);
  });
});

describe('upcomingDates', () => {
  it('lists both dates of a person, the nearest first', () => {
    expect(
      upcomingDates([anna, grandfather, greatGrandmother]).map(
        (date) => `${date.daysUntil} ${date.kind} ${date.person.name} ${date.years}`,
      ),
    ).toEqual([
      '0 birthday Grandfather 86',
      '0 memorial Great-grandmother null',
      '1 birthday Anna 36',
      '1 memorial Grandfather 10',
    ]);
  });
});

describe('birthdayInputSchema', () => {
  const valid = (input: Record<string, unknown>) =>
    birthdayInputSchema.safeParse({ name: 'X', ...input }).success;

  it('takes a birthday, a day of death, or both', () => {
    expect(valid({ month: 3, day: 5 })).toBe(true);
    expect(valid({ deathMonth: 3, deathDay: 5, deathYear: 2010 })).toBe(true);
    expect(valid({ month: 3, day: 5, deathMonth: 2, deathDay: 29 })).toBe(true);
  });

  it('refuses a person without any date, half a date and a day the month lacks', () => {
    expect(valid({})).toBe(false);
    expect(valid({ month: 3 })).toBe(false);
    expect(valid({ month: 3, day: 5, deathDay: 4 })).toBe(false);
    expect(valid({ deathMonth: 2, deathDay: 30 })).toBe(false);
  });

  it('reminds of a day of memory on the day and the day before by default', () => {
    const parsed = birthdayInputSchema.parse({ name: 'X', deathMonth: 3, deathDay: 5 });
    expect(parsed.memorialRemindDaysBefore).toEqual([0, 1]);
  });
});

describe('birthdayMessages', () => {
  const en = birthdayMessages('en');
  const ru = birthdayMessages('ru');

  it('speaks of the dead without congratulations', () => {
    expect(en.inMemory(grandfather)).toBe(
      'Today is the birthday of Grandfather — would have turned 86.',
    );
    expect(ru.inMemory(grandfather)).toBe(
      'Сегодня день рождения: Grandfather — исполнилось бы 86.',
    );
    expect(ru.memorialSoon(grandfather)).toBe(
      'Завтра день памяти: Grandfather — 10 лет со дня смерти.',
    );
    expect(ru.memorialToday(greatGrandmother)).toBe('Сегодня день памяти: Great-grandmother.');
    expect(en.memorialToday(greatGrandmother)).toBe(
      'Today is the day of memory of Great-grandmother.',
    );
  });
});
