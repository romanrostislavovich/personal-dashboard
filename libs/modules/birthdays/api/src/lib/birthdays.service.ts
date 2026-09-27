import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import { birthdayInputSchema, DateParts, todayIn, UpcomingBirthday } from '@pd/contracts';
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
  ) {}

  /** All of the user's birthdays, upcoming ones first. */
  async list(userId: string): Promise<UpcomingBirthday[]> {
    const rows = await this.db.select().from(birthdays).where(eq(birthdays.userId, userId));
    const today = this.today();
    return rows.map((row) => toUpcoming(row, today)).sort((a, b) => a.daysUntil - b.daysUntil);
  }

  async create(userId: string, input: ValidBirthdayInput): Promise<UpcomingBirthday> {
    const [row] = await this.db
      .insert(birthdays)
      .values({ userId, ...input })
      .returning();
    return toUpcoming(row, this.today());
  }

  async update(userId: string, id: string, input: ValidBirthdayInput): Promise<UpcomingBirthday> {
    const [row] = await this.db
      .update(birthdays)
      .set(input)
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

function toUpcoming(row: BirthdayRow, today: DateParts): UpcomingBirthday {
  return {
    id: row.id,
    name: row.name,
    month: row.month,
    day: row.day,
    year: row.year,
    note: row.note,
    remindDaysBefore: row.remindDaysBefore,
    ...nextBirthday(row, today),
  };
}
