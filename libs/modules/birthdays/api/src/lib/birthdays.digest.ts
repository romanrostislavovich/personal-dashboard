import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { BirthdaysService } from './birthdays.service';

/** How far ahead the digest looks. */
const WEEK = 7;

/** Birthdays of the coming week in the morning digest. */
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
        'Birthdays today and in the coming week: name, date, the age they are turning, a note ' +
        '(often gift ideas). Mention the ones that are today and the ones new to the list.',
      // Dates, not "days until": the list changes when someone enters the week or it is the day.
      collect: async (userId) => {
        const upcoming = (await this.birthdays.list(userId)).filter((b) => b.daysUntil <= WEEK);
        return {
          today: upcoming.filter((b) => b.daysUntil === 0).map((b) => b.name),
          week: upcoming.map(({ name, nextDate, turningAge, note }) => ({
            name,
            date: nextDate,
            turningAge,
            note,
          })),
        };
      },
    });
  }
}
