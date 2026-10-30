import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import {DB, Database, withoutTrash, ZodValidationPipe} from '@pd/api-core';
import {
  telemetryBucketSchema,
  telemetryIngestSchema,
  TelemetryPage,
  telemetryQuerySchema,
  workstateIdSchema,
} from '@pd/contracts';
import {and, desc, eq, gte, lt, lte, or} from 'drizzle-orm';
import {ActivityContextStore} from './activity-context.store';
import {contextCutoff, sanitizeTelemetryPage} from './activity-context.policy';
import {telemetryDynamics} from './activity-context.schema';

@Injectable()
export class TelemetryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly context: ActivityContextStore,
  ) {}

  async record(
    userId: string,
    input: unknown,
    deviceId?: string,
  ): Promise<{saved: number}> {
    const body = new ZodValidationPipe(telemetryIngestSchema).transform(input);
    const source = deviceId ? 'desktop' : 'browser';
    const now = Date.now();
    if (
      body.buckets.some(
        bucket =>
          bucket.source !== source || Date.parse(bucket.endedAt) > now + 60_000,
      )
    ) {
      throw new BadRequestException('Invalid telemetry source or future time');
    }
    if (deviceId) await this.context.verifyDevice(userId, deviceId);
    const words = await this.context.privateWords(userId);
    const rows = body.buckets
      .filter(
        bucket => Date.parse(bucket.startedAt) >= contextCutoff(now).getTime(),
      )
      .map(bucket => {
        const page = sanitizeTelemetryPage(bucket.page, words);
        return {
          userId,
          id: bucket.id,
          deviceId: deviceId ?? null,
          source: bucket.source,
          startedAt: new Date(bucket.startedAt),
          endedAt: new Date(bucket.endedAt),
          metrics: bucket.metrics,
          page: page ? JSON.stringify(page) : null,
        };
      });
    if (!rows.length) return {saved: 0};
    const saved = await this.db
      .insert(telemetryDynamics)
      .values(rows)
      .onConflictDoNothing({
        target: [telemetryDynamics.userId, telemetryDynamics.id],
      })
      .returning({id: telemetryDynamics.id});
    return {saved: saved.length};
  }

  async list(userId: string, input: unknown): Promise<TelemetryPage> {
    const query = new ZodValidationPipe(telemetryQuerySchema).transform(input);
    const table = telemetryDynamics;
    const rows = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.userId, userId),
          gte(table.startedAt, contextCutoff()),
          query.from ? gte(table.startedAt, new Date(query.from)) : undefined,
          query.to ? lte(table.startedAt, new Date(query.to)) : undefined,
          query.source ? eq(table.source, query.source) : undefined,
          query.before && query.beforeId
            ? or(
                lt(table.startedAt, new Date(query.before)),
                and(
                  eq(table.startedAt, new Date(query.before)),
                  lt(table.id, query.beforeId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(table.startedAt), desc(table.id))
      .limit(query.limit);
    const words = await this.context.privateWords(userId);
    const items = rows.map(row => {
      const bucket = telemetryBucketSchema.parse({
        id: row.id,
        source: row.source,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        metrics: row.metrics,
        ...(row.page ? {page: JSON.parse(row.page)} : {}),
      });
      return {
        ...bucket,
        page: sanitizeTelemetryPage(bucket.page, words),
        deviceId: row.deviceId,
      };
    });
    const last = rows.at(-1);
    return {
      items,
      nextCursor:
        last && rows.length === query.limit
          ? {before: last.startedAt.toISOString(), beforeId: last.id}
          : null,
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const parsed = new ZodValidationPipe(workstateIdSchema).transform(id);
    await withoutTrash(this.db, async tx =>
      tx
        .delete(telemetryDynamics)
        .where(
          and(
            eq(telemetryDynamics.userId, userId),
            eq(telemetryDynamics.id, parsed),
          ),
        ),
    );
  }

  async clear(userId: string): Promise<void> {
    await withoutTrash(this.db, async tx =>
      tx.delete(telemetryDynamics).where(eq(telemetryDynamics.userId, userId)),
    );
  }

  async deleteOld(userId: string): Promise<void> {
    await withoutTrash(this.db, async tx =>
      tx
        .delete(telemetryDynamics)
        .where(
          and(
            eq(telemetryDynamics.userId, userId),
            lt(telemetryDynamics.startedAt, contextCutoff()),
          ),
        ),
    );
  }
}
