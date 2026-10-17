import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, UsersService } from '@pd/api-core';
import {
  addDays,
  DailyMetric,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import { and, eq, gte, lte } from 'drizzle-orm';
import { habitDays, habits } from './habits.schema';

/**
 * What habits tell the other sections (see LinksService): every habit as a daily number — 1 on
 * a day with it (or done), its amount when it has a unit, 0 on the other days from its start —
 * so the links engine sees what goes with a drink or a run.
 */
@Injectable()
export class HabitsLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'habits',
      metrics: async (userId, period) => {
        const rows = await this.db.select().from(habits).where(eq(habits.userId, userId));
        if (!rows.length) {
          return [];
        }
        const marks = await this.db
          .select()
          .from(habitDays)
          .where(
            and(
              eq(habitDays.userId, userId),
              gte(habitDays.day, period.from),
              lte(habitDays.day, period.to),
            ),
          );
        const user = await this.users.findById(userId);
        const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
        const last = period.to < today ? period.to : today;
        return rows.flatMap((habit): DailyMetric[] => {
          const marked = new Map(
            marks
              .filter((mark) => mark.habitId === habit.id && mark.status !== 'clean')
              .map((mark) => [mark.day, mark.amount ?? 1]),
          );
          const days: { day: LocalDate; value: number }[] = [];
          const first = habit.startedOn > period.from ? habit.startedOn : period.from;
          for (let day = first; day <= last; day = next(day)) {
            days.push({ day, value: marked.get(day) ?? 0 });
          }
          return days.length
            ? [
                {
                  key: `habits.${habit.id}`,
                  module: 'habits',
                  labelKey: `habits.kinds.${habit.kind}`,
                  ...(habit.name ? { label: habit.name } : {}),
                  unit: 'count',
                  days,
                },
              ]
            : [];
        });
      },
    });
  }
}

function next(day: LocalDate): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), 1));
}
