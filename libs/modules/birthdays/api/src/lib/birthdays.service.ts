import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, LinksService } from '@pd/api-core';
import {
  birthdayInputSchema,
  DateParts,
  daysUntilNearest,
  todayIn,
  UpcomingBirthday,
} from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { BirthdayRow, birthdays } from './birthdays.schema';
import { nextBirthday } from './next-birthday';

/** Data after validation (with defaults filled in). */
export type ValidBirthdayInput = z.output<typeof birthdayInputSchema>;

@Injectable()
export class BirthdaysService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly links: LinksService,
  ) {}

  /** All of the user's people, the one with the nearest date (a birthday or a day of memory) first. */
  async list(userId: string): Promise<UpcomingBirthday[]> {
    const rows = await this.db.select().from(birthdays).where(eq(birthdays.userId, userId));
    const today = this.today();
    // Gift ideas are another section's (the wishlist): the core tells them by the name.
    const ideas = await this.links.aboutPeople(
      userId,
      rows.map((row) => row.name),
    );
    return rows
      .map((row) => ({
        ...toUpcoming(row, today),
        giftIdeas: (ideas.get(row.name.trim().toLowerCase()) ?? []).filter(
          (note) => note.kind === 'gift',
        ),
      }))
      .sort((a, b) => daysUntilNearest(a) - daysUntilNearest(b));
  }

  async create(userId: string, input: ValidBirthdayInput): Promise<UpcomingBirthday> {
    const [row] = await this.db
      .insert(birthdays)
      .values({ userId, ...stored(input) })
      .returning();
    return toUpcoming(row, this.today());
  }

  async update(userId: string, id: string, input: ValidBirthdayInput): Promise<UpcomingBirthday> {
    const [row] = await this.db
      .update(birthdays)
      .set(stored(input))
      .where(and(eq(birthdays.id, id), eq(birthdays.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toUpcoming(row, this.today());
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(birthdays).where(and(eq(birthdays.id, id), eq(birthdays.userId, userId)));
  }

  private today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }
}

/** What is not given is stored as empty: on an update `undefined` would keep the old value. */
function stored(input: ValidBirthdayInput) {
  return {
    ...input,
    month: input.month ?? null,
    day: input.day ?? null,
    year: input.year ?? null,
    note: input.note ?? null,
    deathMonth: input.deathMonth ?? null,
    deathDay: input.deathDay ?? null,
    deathYear: input.deathYear ?? null,
  };
}

export function toUpcoming(row: BirthdayRow, today: DateParts): UpcomingBirthday {
  const born =
    row.month && row.day
      ? nextBirthday({ month: row.month, day: row.day, year: row.year }, today)
      : null;
  // A day of memory comes round like a birthday does: the same day every year.
  const died =
    row.deathMonth && row.deathDay
      ? nextBirthday({ month: row.deathMonth, day: row.deathDay, year: row.deathYear }, today)
      : null;
  return {
    id: row.id,
    name: row.name,
    month: row.month,
    day: row.day,
    year: row.year,
    note: row.note,
    remindDaysBefore: row.remindDaysBefore,
    deathMonth: row.deathMonth,
    deathDay: row.deathDay,
    deathYear: row.deathYear,
    memorialRemindDaysBefore: row.memorialRemindDaysBefore,
    nextDate: born?.nextDate ?? null,
    daysUntil: born?.daysUntil ?? null,
    turningAge: born?.turningAge ?? null,
    memorial: died && {
      nextDate: died.nextDate,
      daysUntil: died.daysUntil,
      // The year someone died in has no anniversary yet.
      years: died.turningAge || null,
    },
    giftIdeas: [],
  };
}
