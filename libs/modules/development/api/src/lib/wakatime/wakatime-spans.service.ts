import {Inject, Injectable, Logger} from '@nestjs/common';
import {DB, Database} from '@pd/api-core';
import {LocalDate} from '@pd/contracts';
import {and, eq, gt, gte, inArray, lt} from 'drizzle-orm';
import {WakatimeClient, WakatimePlanError} from './wakatime.client';
import {WakatimeDuration, WakatimeSlice} from './wakatime-durations';
import {wakatimeSpans} from './wakatime.schema';

/** Days read again at a sync: each is two requests, and older ones do not change any more. */
const MAX_DAYS = 7;
const SLICES: WakatimeSlice[] = ['project', 'machine'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** A stretch of coding as it is saved. */
export interface SavedSpan {
  name: string;
  startedAt: Date;
  endedAt: Date;
}

/**
 * The stretches of coding of WakaTime (its durations), by project and by computer: copied with
 * the days, read by the time at the computer (see WakatimeOtherComputers).
 */
@Injectable()
export class WakatimeSpansService {
  private readonly logger = new Logger(WakatimeSpansService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Copies the stretches of the latest of these days. A failure is only logged: the days'
   * totals are already saved, and the stretches are read again at the next sync.
   */
  async sync(
    userId: string,
    client: WakatimeClient,
    days: LocalDate[],
  ): Promise<void> {
    const latest = [...days].sort().slice(-MAX_DAYS);
    if (!latest.length) {
      return;
    }
    try {
      const machineNames = await client.getMachineNames();
      for (const day of latest) {
        for (const slice of SLICES) {
          const spans = await client
            .getDurations(day, slice, machineNames)
            .catch(error => {
              // The plan does not give that day any more: it keeps what was copied before.
              if (error instanceof WakatimePlanError) {
                return null;
              }
              throw error;
            });
          if (spans) {
            await this.save(userId, day, slice, spans);
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `WakaTime stretches were not copied for ${userId}: ${String(error)}`,
      );
    }
  }

  /** The stretches of a kind that overlap the time between two moments, by name. */
  async between(
    userId: string,
    kind: WakatimeSlice,
    from: Date,
    to: Date,
    names?: string[],
  ): Promise<SavedSpan[]> {
    const s = wakatimeSpans;
    if (names && !names.length) {
      return [];
    }
    return this.db
      .select({name: s.name, startedAt: s.startedAt, endedAt: s.endedAt})
      .from(s)
      .where(
        and(
          eq(s.userId, userId),
          eq(s.kind, kind),
          lt(s.startedAt, to),
          gt(s.endedAt, from),
          // No stretch of WakaTime outlasts its day: the index on the start is used from here.
          gte(s.startedAt, new Date(from.getTime() - DAY_MS)),
          names ? inArray(s.name, names) : undefined,
        ),
      );
  }

  /** The names of a kind seen between two moments (the projects of WakaTime). */
  async names(
    userId: string,
    kind: WakatimeSlice,
    from: Date,
    to: Date,
  ): Promise<string[]> {
    const spans = await this.between(userId, kind, from, to);
    return [...new Set(spans.map(span => span.name))];
  }

  /**
   * A day read again replaces its stretches. Only what changed is written: the same days are
   * read every hour, and an unchanged row written again would be sent again by the sync
   * between instances (docs/sync.md).
   */
  private async save(
    userId: string,
    day: LocalDate,
    kind: WakatimeSlice,
    spans: WakatimeDuration[],
  ): Promise<void> {
    const s = wakatimeSpans;
    const key = (span: {name: string; startedAt: Date}) =>
      `${span.name}|${span.startedAt.getTime()}`;
    await this.db.transaction(async tx => {
      const saved = await tx
        .select()
        .from(s)
        .where(and(eq(s.userId, userId), eq(s.kind, kind), eq(s.day, day)));
      const savedByKey = new Map(saved.map(row => [key(row), row]));
      const fresh = new Map(spans.map(span => [key(span), span]));
      for (const row of saved) {
        if (!fresh.has(key(row))) {
          await tx
            .delete(s)
            .where(
              and(
                eq(s.userId, userId),
                eq(s.kind, kind),
                eq(s.name, row.name),
                eq(s.startedAt, row.startedAt),
              ),
            );
        }
      }
      for (const span of fresh.values()) {
        const old = savedByKey.get(key(span));
        if (old?.endedAt.getTime() === span.endedAt.getTime()) {
          continue;
        }
        await tx
          .insert(s)
          .values({userId, kind, day, ...span})
          .onConflictDoUpdate({
            target: [s.userId, s.kind, s.name, s.startedAt],
            set: {endedAt: span.endedAt, day},
          });
      }
    });
  }
}
