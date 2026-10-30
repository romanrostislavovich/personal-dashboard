import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import {DB, Database, ZodValidationPipe} from '@pd/api-core';
import {
  activityPeriodSchema,
  addDays,
  daysBetween,
  parseLocalDate,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import {and, asc, eq, gt, gte, lt, or} from 'drizzle-orm';
import {contextCutoff} from './activity-context.policy';
import {telemetryDynamics} from './activity-context.schema';
import {ActivityService} from './activity.service';
import {
  telemetryDays,
  TelemetrySummary,
  TelemetrySummaryMetric,
} from './telemetry-summary';

const PAGE_SIZE = 1000;

@Injectable()
export class TelemetrySummaryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly activity: ActivityService,
  ) {}

  async summarize(
    userId: string,
    input: unknown,
  ): Promise<TelemetrySummaryMetric[]> {
    const period = new ZodValidationPipe(activityPeriodSchema).transform(input);
    if (
      [period.from, period.to].some(
        day => toLocalDate(addDays(parseLocalDate(day), 0)) !== day,
      )
    ) {
      throw new BadRequestException('Invalid telemetry summary date');
    }
    const length = daysBetween(
      parseLocalDate(period.from),
      parseLocalDate(period.to),
    );
    if (!Number.isFinite(length) || length < 0 || length > 3660) {
      throw new BadRequestException('Invalid telemetry summary period');
    }
    const timeZone = await this.activity.timeZone(userId);
    const now = new Date();
    const cutoff = contextCutoff(now.getTime());
    const firstRetained = toLocalDate(todayIn(timeZone, cutoff));
    const today = toLocalDate(todayIn(timeZone, now));
    const retainedPeriod = {
      from: period.from > firstRetained ? period.from : firstRetained,
      to: period.to < today ? period.to : today,
    };
    if (retainedPeriod.from > retainedPeriod.to) return [];
    const days = telemetryDays(retainedPeriod, timeZone)
      .filter(day => day.end > cutoff.getTime() && day.start < now.getTime())
      .map(day => ({...day, end: Math.min(day.end, now.getTime())}));
    if (!days.length) return [];
    const summary = new TelemetrySummary(days);
    const table = telemetryDynamics;
    let cursor: {startedAt: Date; id: string} | undefined;
    for (;;) {
      // Never select encrypted page metadata for correlations, Life or AI summaries.
      const rows = await this.db
        .select({
          id: table.id,
          source: table.source,
          startedAt: table.startedAt,
          endedAt: table.endedAt,
          metrics: table.metrics,
        })
        .from(table)
        .where(
          and(
            eq(table.userId, userId),
            gte(table.startedAt, cutoff),
            gt(table.endedAt, new Date(days[0].start)),
            lt(table.startedAt, new Date(days[days.length - 1].end)),
            lt(table.startedAt, now),
            period.deviceId ? eq(table.deviceId, period.deviceId) : undefined,
            cursor
              ? or(
                  gt(table.startedAt, cursor.startedAt),
                  and(
                    eq(table.startedAt, cursor.startedAt),
                    gt(table.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(table.startedAt), asc(table.id))
        .limit(PAGE_SIZE);
      for (const row of rows) summary.add(row);
      if (rows.length < PAGE_SIZE) break;
      cursor = rows[rows.length - 1];
    }
    return summary.result();
  }
}
