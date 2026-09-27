import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, projects } from '@pd/api-core';
import { eq, lt, sql } from 'drizzle-orm';
import { checkHttp } from './checks/http-check';
import { fetchSslExpiry } from './checks/ssl-check';
import { checkResults, MonitorRow, monitors } from './monitoring.schema';
import { applyCheck, MonitorEvent } from './state/monitor-state';

/** A notification event together with whom and what to send it about. */
export interface MonitorNotice {
  userId: string;
  projectName: string;
  url: string;
  event: MonitorEvent;
  error: string | null;
}

export interface SslNotice {
  userId: string;
  projectName: string;
  url: string;
  expiresAt: Date;
}

const RESULTS_RETENTION_DAYS = 35;

/** Runs checks and updates monitor state. */
@Injectable()
export class CheckerService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Checks all monitors of all users; returns "down/up" events. */
  async checkAll(): Promise<MonitorNotice[]> {
    const rows = await this.monitorsWithProjects();
    const notices = await Promise.all(
      rows.map((row) => this.checkOne(row.monitor, row.projectName)),
    );
    return notices.filter((notice): notice is MonitorNotice => notice !== null);
  }

  async checkOne(monitor: MonitorRow, projectName: string): Promise<MonitorNotice | null> {
    const result = await checkHttp(monitor.url);
    const now = new Date();
    const { state, event } = applyCheck(monitor, result.isUp, now);

    await this.db.insert(checkResults).values({
      monitorId: monitor.id,
      checkedAt: now,
      isUp: result.isUp,
      statusCode: result.statusCode,
      responseMs: result.responseMs,
    });
    await this.db
      .update(monitors)
      .set({
        ...state,
        lastCheckedAt: now,
        lastStatusCode: result.statusCode,
        lastResponseMs: result.responseMs,
        lastError: result.error,
      })
      .where(eq(monitors.id, monitor.id));

    return event
      ? { userId: monitor.userId, projectName, url: monitor.url, event, error: result.error }
      : null;
  }

  /** Updates SSL certificate dates; returns all https monitors with a known date. */
  async refreshSsl(): Promise<SslNotice[]> {
    const rows = await this.monitorsWithProjects();
    const notices: SslNotice[] = [];
    for (const { monitor, projectName } of rows) {
      const expiresAt = await this.updateSsl(monitor);
      if (expiresAt) {
        notices.push({ userId: monitor.userId, projectName, url: monitor.url, expiresAt });
      }
    }
    return notices;
  }

  /** The first check right after adding, so the status shows up without waiting 5 minutes. */
  async checkNew(monitor: MonitorRow): Promise<void> {
    await Promise.all([this.checkOne(monitor, ''), this.updateSsl(monitor)]);
  }

  private async updateSsl(monitor: MonitorRow): Promise<Date | null> {
    const expiresAt = await fetchSslExpiry(monitor.url);
    if (expiresAt) {
      await this.db
        .update(monitors)
        .set({ sslExpiresAt: expiresAt })
        .where(eq(monitors.id, monitor.id));
    }
    return expiresAt;
  }

  /** Old check results are not needed anymore: statistics cover at most 30 days. */
  async deleteOldResults(): Promise<void> {
    await this.db
      .delete(checkResults)
      .where(
        lt(checkResults.checkedAt, sql`now() - make_interval(days => ${RESULTS_RETENTION_DAYS})`),
      );
  }

  private monitorsWithProjects() {
    return this.db
      .select({ monitor: monitors, projectName: projects.name })
      .from(monitors)
      .innerJoin(projects, eq(projects.id, monitors.projectId));
  }
}
