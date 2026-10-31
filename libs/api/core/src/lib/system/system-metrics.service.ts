import {Inject, Injectable} from '@nestjs/common';
import {SystemMetrics} from '@pd/contracts';
import {and, gte, inArray, sql} from 'drizzle-orm';
import {aiUsage} from '../ai/ai.schema';
import {DB, Database} from '../database/database.module';
import {notificationOutbox} from '../notifications/notifications.schema';
import {SyncService} from '../sync/sync.service';
import {processCounters} from './process-counters';

const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

/**
 * The instance's numbers for Settings → System: this process's counters (requests, job runs,
 * memory) and what the database already knows (the AI's usage, the notifications' delivery,
 * sync). No Prometheus: the server is small and the owner reads them on the page.
 */
@Injectable()
export class SystemMetricsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly sync: SyncService,
  ) {}

  async snapshot(now = new Date()): Promise<SystemMetrics> {
    const counters = processCounters;
    const [ai, notifications, sync] = await Promise.all([
      this.aiToday(now),
      this.notificationsSince(new Date(now.getTime() - DAY_MS)),
      this.syncState(),
    ]);
    return {
      since: counters.startedAt.toISOString(),
      memoryMb: Math.round(process.memoryUsage().rss / MB),
      requests: {
        total: counters.requests,
        serverErrors: counters.serverErrors,
        p95Ms: counters.p95(),
      },
      jobs: {runs: counters.jobRuns, failures: counters.jobFailures},
      ai,
      notifications,
      sync,
    };
  }

  private async aiToday(now: Date): Promise<SystemMetrics['ai']> {
    const [row] = await this.db
      .select({
        requests: sql<number>`coalesce(sum(${aiUsage.requests}), 0)::int`,
        promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)::int`,
        completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)::int`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.day, now.toISOString().slice(0, 10)));
    return row ?? {requests: 0, promptTokens: 0, completionTokens: 0};
  }

  private async notificationsSince(
    from: Date,
  ): Promise<SystemMetrics['notifications']> {
    const rows = await this.db
      .select({
        status: notificationOutbox.status,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationOutbox)
      .where(
        and(
          gte(notificationOutbox.createdAt, from),
          inArray(notificationOutbox.status, [
            'sent',
            'failed',
            'held',
            'pending',
            'sending',
          ]),
        ),
      )
      .groupBy(notificationOutbox.status);
    const count = (...statuses: string[]) =>
      rows
        .filter(row => statuses.includes(row.status))
        .reduce((sum, row) => sum + row.count, 0);
    return {
      sent: count('sent'),
      failed: count('failed'),
      waiting: count('held', 'pending', 'sending'),
    };
  }

  private async syncState(): Promise<SystemMetrics['sync']> {
    if (this.sync.mode === 'off') {
      return null;
    }
    const status = await this.sync.status();
    return {
      lastAt: status.lastSyncedAt,
      pending: status.pendingChanges,
      parked: status.parked,
    };
  }
}
