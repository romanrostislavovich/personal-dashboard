import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DB, Database, ProjectsService } from '@pd/api-core';
import { Monitor, MonitorInput, ResponseTimePoint } from '@pd/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { checkResults, MonitorRow, monitors } from './monitoring.schema';

interface UptimeRow extends Record<string, unknown> {
  monitor_id: string;
  day: number | null;
  week: number | null;
  month: number | null;
}

interface ResponseRow extends Record<string, unknown> {
  monitor_id: string;
  hour: Date;
  avg_ms: number;
}

@Injectable()
export class MonitorsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly projects: ProjectsService,
  ) {}

  async list(userId: string): Promise<Monitor[]> {
    const rows = await this.db
      .select()
      .from(monitors)
      .where(eq(monitors.userId, userId))
      .orderBy(asc(monitors.createdAt));
    if (rows.length === 0) {
      return [];
    }

    const ids = sql.join(
      rows.map((row) => sql`${row.id}::uuid`),
      sql`, `,
    );

    // Percentage of successful checks for a day / week / 30 days in one query.
    const uptime = await this.db.execute<UptimeRow>(sql`
      SELECT monitor_id,
        ${uptimeFor('1 day')} AS day,
        ${uptimeFor('7 days')} AS week,
        ${uptimeFor('30 days')} AS month
      FROM ${checkResults}
      WHERE monitor_id IN (${ids}) AND checked_at > now() - interval '30 days'
      GROUP BY monitor_id
    `);

    // Average response time per hour over the last day (successful checks only).
    const responses = await this.db.execute<ResponseRow>(sql`
      SELECT monitor_id, date_trunc('hour', checked_at) AS hour, round(avg(response_ms))::int AS avg_ms
      FROM ${checkResults}
      WHERE monitor_id IN (${ids}) AND is_up AND checked_at > now() - interval '24 hours'
      GROUP BY monitor_id, hour
      ORDER BY hour
    `);

    return rows.map((row) =>
      toMonitor(
        row,
        uptime.rows.find((u) => u.monitor_id === row.id),
        responses.rows.filter((r) => r.monitor_id === row.id),
      ),
    );
  }

  async create(userId: string, input: MonitorInput): Promise<MonitorRow> {
    await this.projects.assertOwned(userId, input.projectId);
    const existing = await this.db.$count(
      monitors,
      and(eq(monitors.userId, userId), eq(monitors.url, input.url)),
    );
    if (existing > 0) {
      throw new ConflictException('This URL is already monitored');
    }
    const [row] = await this.db
      .insert(monitors)
      .values({ userId, ...input })
      .returning();
    return row;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(monitors).where(and(eq(monitors.id, id), eq(monitors.userId, userId)));
  }
}

/** Share of successful checks for a period, 0–100 with one decimal place. */
function uptimeFor(period: string) {
  const window = sql.raw(`checked_at > now() - interval '${period}'`);
  return sql`round(100.0 * count(*) FILTER (WHERE is_up AND ${window}) / NULLIF(count(*) FILTER (WHERE ${window}), 0), 1)::float`;
}

function toMonitor(
  row: MonitorRow,
  uptime: UptimeRow | undefined,
  responses: ResponseRow[],
): Monitor {
  return {
    id: row.id,
    projectId: row.projectId,
    url: row.url,
    status: row.status,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastStatusCode: row.lastStatusCode,
    lastResponseMs: row.lastResponseMs,
    lastError: row.lastError,
    downSince: row.status === 'down' ? (row.failingSince?.toISOString() ?? null) : null,
    sslExpiresAt: row.sslExpiresAt?.toISOString() ?? null,
    uptime: {
      day: uptime?.day ?? null,
      week: uptime?.week ?? null,
      month: uptime?.month ?? null,
    },
    responseTimes: responses.map((r): ResponseTimePoint => ({
      at: new Date(r.hour).toISOString(),
      avgMs: r.avg_ms,
    })),
  };
}
