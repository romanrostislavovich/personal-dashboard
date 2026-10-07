import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService } from '@pd/api-core';
import { LifeEvent } from '@pd/contracts';
import { and, eq } from 'drizzle-orm';
import { AnyPgColumn } from 'drizzle-orm/pg-core';
import { birthdays } from './birthdays.schema';

/** Whose birthday or day of memory a day is, in the life timeline. */
@Injectable()
export class BirthdaysLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'birthdays',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const [, month, date] = day.split('-').map(Number);
        const names = async (monthOf: AnyPgColumn, dayOf: AnyPgColumn) =>
          (
            await this.db
              .select({ name: birthdays.name })
              .from(birthdays)
              .where(and(eq(birthdays.userId, userId), eq(monthOf, month), eq(dayOf, date)))
          )
            .map((row) => row.name)
            .join(', ');
        const born = await names(birthdays.month, birthdays.day);
        const died = await names(birthdays.deathMonth, birthdays.deathDay);
        const event = (icon: string, key: string, people: string): LifeEvent => ({
          module: 'birthdays',
          icon,
          key,
          params: { names: people },
          at: null,
          link: '/birthdays',
        });
        return [
          ...(born ? [event('cake', 'birthdays.life.day', born)] : []),
          ...(died ? [event('local_florist', 'birthdays.life.memorial', died)] : []),
        ];
      },
    });
  }
}
