import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, LinksService} from '@pd/api-core';
import {
  addDays,
  HourlyMetric,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import {and, eq, gte, lt, sql} from 'drizzle-orm';
import {AnyPgColumn} from 'drizzle-orm/pg-core';
import {
  healthBandHours,
  healthBandMinutes,
  healthBandStressHours,
} from './band.schema';

/** An hour of this many steps or more is a walk (an event of the hour, for "the hour after"). */
const WALK_STEPS = 1500;

/**
 * The band hour by hour for Links (docs/telemetry.md): the steps, the pulse and our stress
 * score of each hour, and the walks. Only the days the band told anything — a day it was not
 * worn is unknown, never a zero.
 */
@Injectable()
export class WearableHoursLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
  ) {}

  onModuleInit(): void {
    this.links.registerHourly({
      module: 'health',
      hours: async (userId, period, timeZone) => {
        const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
        const from = zonedToUtc({date: period.from, time: '00:00'}, timeZone);
        const to = zonedToUtc({date: after, time: '00:00'}, timeZone);
        const hourOf = (column: AnyPgColumn) =>
          sql<string>`to_char(${column} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD"T"HH24')`;

        const h = healthBandHours;
        const steps = await this.db
          .select({
            hour: hourOf(h.at),
            value: sql<number>`coalesce(sum(${h.steps}), 0)::float`,
          })
          .from(h)
          .where(and(eq(h.userId, userId), gte(h.at, from), lt(h.at, to)))
          .groupBy(sql`1`);
        const m = healthBandMinutes;
        const pulse = await this.db
          .select({
            hour: hourOf(m.at),
            value: sql<number>`avg(${m.bpm})::float`,
          })
          .from(m)
          .where(
            and(
              eq(m.userId, userId),
              gte(m.at, from),
              lt(m.at, to),
              sql`${m.bpm} IS NOT NULL`,
            ),
          )
          .groupBy(sql`1`);
        const s = healthBandStressHours;
        const stress = await this.db
          .select({
            hour: hourOf(s.at),
            value: sql<number>`avg(${s.score})::float`,
          })
          .from(s)
          .where(and(eq(s.userId, userId), gte(s.at, from), lt(s.at, to)))
          .groupBy(sql`1`);

        const daysOf = (rows: {hour: string}[]): LocalDate[] => [
          ...new Set(rows.map(row => row.hour.slice(0, 10))),
        ];
        const worn = daysOf([...steps, ...pulse, ...stress]).sort();
        const metric = (
          key: string,
          unit: HourlyMetric['unit'],
          rows: {hour: string; value: number}[],
          days: LocalDate[],
        ): HourlyMetric[] =>
          rows.length
            ? [
                {
                  key: `health.hour.${key}`,
                  module: 'health',
                  labelKey: `health.links.hour.${key}`,
                  unit,
                  days,
                  hours: rows.map(row => ({
                    hour: row.hour,
                    value: Math.round(row.value * 10) / 10,
                  })),
                },
              ]
            : [];
        return {
          metrics: [
            ...metric('steps', 'count', steps, daysOf(steps)),
            ...metric('pulse', 'score', pulse, worn),
            ...metric('stress', 'score', stress, worn),
          ],
          events: steps.length
            ? [
                {
                  key: 'health.event.walk',
                  module: 'health',
                  labelKey: 'health.links.walk',
                  days: daysOf(steps),
                  hours: steps
                    .filter(row => row.value >= WALK_STEPS)
                    .map(row => row.hour),
                  itself: ['health.hour.steps'],
                },
              ]
            : [],
        };
      },
    });
  }
}
