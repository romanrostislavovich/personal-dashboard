import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { upcomingDates } from '@pd/contracts';
import { BirthdaysService } from './birthdays.service';

/** How far ahead the digest looks. */
const WEEK = 7;

/** Birthdays and days of memory of the coming week in the morning digest. */
@Injectable()
export class BirthdaysDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly birthdays: BirthdaysService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'birthdays.week',
      module: 'birthdays',
      description:
        'Birthdays and days of memory today and in the coming week: name, date, `kind`, a ' +
        'note. `birthday` — `years` is the age they are turning, the note often has gift ' +
        'ideas. `memorial` — the day someone died, `years` since; `birthday` with `inMemory` ' +
        '— the birthday of someone who has died. Speak of those two plainly and warmly: no ' +
        'congratulations, no exclamation marks, no gift ideas. Mention the ones that are ' +
        'today and the ones new to the list.',
      // Dates, not "days until": the list changes when someone enters the week or it is the day.
      collect: async (userId) => {
        const upcoming = upcomingDates(await this.birthdays.list(userId)).filter(
          (date) => date.daysUntil <= WEEK,
        );
        return {
          today: upcoming.filter((date) => date.daysUntil === 0).map((date) => date.person.name),
          week: upcoming.map(({ kind, person, date, years }) => ({
            name: person.name,
            kind,
            ...(kind === 'birthday' && person.memorial ? { inMemory: true } : {}),
            date,
            years,
            note: person.note,
          })),
        };
      },
    });
  }
}
