import { Inject, Injectable } from '@nestjs/common';
import { SystemJob } from '@pd/contracts';
import { asc, eq, sql } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { systemJobRuns } from './system.schema';

const MAX_ERROR = 1000;

/** Remembers how the last run of every background job went — for Settings → System. */
@Injectable()
export class JobRunsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Runs a job and records the outcome. The error is thrown on, so the queue still sees the run
   * as failed; a bookkeeping failure never breaks the job itself.
   */
  async track(job: { name: string; cron: string }, run: () => Promise<void>): Promise<void> {
    const startedAt = new Date();
    await this.save(job, { lastStartedAt: startedAt });
    try {
      await run();
    } catch (error) {
      await this.save(job, {
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR),
        lastErrorAt: new Date(),
        failures: sql`${systemJobRuns.failures} + 1`,
      });
      throw error;
    }
    const finishedAt = new Date();
    await this.save(job, {
      lastFinishedAt: finishedAt,
      lastDurationMs: finishedAt.getTime() - startedAt.getTime(),
      failures: 0,
    });
  }

  async list(): Promise<SystemJob[]> {
    const rows = await this.db.select().from(systemJobRuns).orderBy(asc(systemJobRuns.name));
    return rows.map((row) => ({
      name: row.name,
      cron: row.cron,
      lastStartedAt: row.lastStartedAt?.toISOString() ?? null,
      lastFinishedAt: row.lastFinishedAt?.toISOString() ?? null,
      lastDurationMs: row.lastDurationMs,
      failures: row.failures,
      lastError: row.lastError,
      lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
    }));
  }

  /** Jobs that are no longer registered (renamed, removed) leave the list. */
  async forget(exceptNames: string[]): Promise<void> {
    for (const row of await this.db.select({ name: systemJobRuns.name }).from(systemJobRuns)) {
      if (!exceptNames.includes(row.name)) {
        await this.db.delete(systemJobRuns).where(eq(systemJobRuns.name, row.name));
      }
    }
  }

  private async save(
    job: { name: string; cron: string },
    values: Partial<typeof systemJobRuns.$inferInsert> | Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .insert(systemJobRuns)
      .values({ name: job.name, cron: job.cron })
      .onConflictDoUpdate({ target: systemJobRuns.name, set: { cron: job.cron, ...values } })
      .catch((error) => console.error('[system] a job run was not recorded:', error));
  }
}
