import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, SecretsService } from '@pd/api-core';
import {
  addDays,
  DateParts,
  LocalDate,
  todayIn,
  toLocalDate,
  WakatimeBreakdown,
  WakatimeDay,
  WakatimePeriod,
  WakatimeSettings,
  WakatimeShare,
  WakatimeStats,
} from '@pd/contracts';
import { and, asc, between, eq, gte, isNotNull, max, min, sql, sum } from 'drizzle-orm';
import { codingTotals, fillDays, sumShares, syncStart } from './coding-stats';
import {
  WakatimeAuthError,
  WakatimeClient,
  WakatimePlanError,
  WakatimeSummaryDay,
} from './wakatime.client';
import { wakatimeDayBreakdown, wakatimeDays, wakatimeSettings } from './wakatime.schema';

const API_KEY_SECRET = 'development.wakatime-key';
/** Rows of a "top projects / languages / editors" list. */
const TOP_LIMIT = 10;

/** Coding time from WakaTime: the saved days, their statistics and the sync that fills them. */
@Injectable()
export class WakatimeService {
  private readonly logger = new Logger(WakatimeService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly secrets: SecretsService,
  ) {}

  async settings(userId: string): Promise<WakatimeSettings> {
    const [row] = await this.db
      .select()
      .from(wakatimeSettings)
      .where(eq(wakatimeSettings.userId, userId));
    return {
      connected: Boolean(row?.username),
      username: row?.username ?? null,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      syncError: row?.syncError ?? null,
    };
  }

  /** Connect: check the key and copy the days WakaTime still has. */
  async connect(userId: string, apiKey: string): Promise<void> {
    let username: string;
    try {
      username = await new WakatimeClient(apiKey).getUsername();
    } catch (error) {
      if (error instanceof WakatimeAuthError) {
        throw new BadRequestException('WakaTime API key is invalid');
      }
      throw error;
    }
    await this.secrets.set(userId, API_KEY_SECRET, apiKey);
    await this.db
      .insert(wakatimeSettings)
      .values({ userId, username })
      .onConflictDoUpdate({
        target: wakatimeSettings.userId,
        set: { username, syncError: null },
      });
    await this.sync(userId);
  }

  /** Disconnect. The saved days stay — WakaTime itself would not give them back. */
  async disconnect(userId: string): Promise<void> {
    await this.secrets.delete(userId, API_KEY_SECRET);
    await this.db
      .update(wakatimeSettings)
      .set({ username: null, syncError: null })
      .where(eq(wakatimeSettings.userId, userId));
  }

  /** All users with WakaTime connected (for the background job). */
  async connectedUserIds(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: wakatimeSettings.userId })
      .from(wakatimeSettings)
      .where(isNotNull(wakatimeSettings.username));
    return rows.map((row) => row.userId);
  }

  /**
   * Copies the latest days from WakaTime: from the last saved day (at least yesterday — it may
   * have been unfinished) to today. An error is saved for the settings card, not thrown.
   */
  async sync(userId: string): Promise<void> {
    const apiKey = await this.secrets.get(userId, API_KEY_SECRET);
    if (!apiKey) {
      return;
    }
    try {
      const today = this.today();
      const client = new WakatimeClient(apiKey);
      const end = toLocalDate(today);
      const days = await client
        .getSummaries(syncStart(await this.lastSavedDay(userId), today), end)
        // A plan that gives less history than the window still gives today.
        .catch((error) => {
          if (error instanceof WakatimePlanError) {
            return client.getSummaries(end, end);
          }
          throw error;
        });
      await this.save(userId, days);
      await this.setSyncResult(userId, null);
    } catch (error) {
      this.logger.warn(`WakaTime sync failed for ${userId}: ${error}`);
      await this.setSyncResult(userId, error instanceof Error ? error.message : String(error));
    }
  }

  async stats(userId: string, period: WakatimePeriod): Promise<WakatimeStats> {
    const today = this.today();
    const from = addDays(today, -(period - 1));
    const days = fillDays(
      await this.days(userId, toLocalDate(from), toLocalDate(today)),
      from,
      today,
    );
    const top = (kind: WakatimeBreakdown) =>
      this.shares(userId, kind, toLocalDate(from), toLocalDate(today));
    const [allTime] = await this.db
      .select({ seconds: sum(wakatimeDays.totalSeconds), since: min(wakatimeDays.day) })
      .from(wakatimeDays)
      .where(eq(wakatimeDays.userId, userId));

    return {
      days,
      todaySeconds: days[days.length - 1]?.seconds ?? 0,
      ...codingTotals(days),
      projects: await top('project'),
      languages: await top('language'),
      editors: await top('editor'),
      operatingSystems: await top('os'),
      allTime: { seconds: Number(allTime?.seconds ?? 0), since: allTime?.since ?? null },
    };
  }

  /** Saved days of a period, oldest first; days without coding are not in the list. */
  days(userId: string, from: LocalDate, to: LocalDate): Promise<WakatimeDay[]> {
    return this.db
      .select({ day: wakatimeDays.day, seconds: wakatimeDays.totalSeconds })
      .from(wakatimeDays)
      .where(and(eq(wakatimeDays.userId, userId), between(wakatimeDays.day, from, to)))
      .orderBy(asc(wakatimeDays.day));
  }

  /** Every saved day — for the achievements. */
  allDays(userId: string): Promise<WakatimeDay[]> {
    return this.days(userId, '0001-01-01', '9999-12-31');
  }

  /** Time per project, language or editor over a period, largest first. */
  async shares(
    userId: string,
    kind: WakatimeBreakdown,
    from: LocalDate,
    to: LocalDate,
    limit = TOP_LIMIT,
  ): Promise<WakatimeShare[]> {
    const rows = await this.db
      .select({ name: wakatimeDayBreakdown.name, seconds: wakatimeDayBreakdown.seconds })
      .from(wakatimeDayBreakdown)
      .where(
        and(
          eq(wakatimeDayBreakdown.userId, userId),
          eq(wakatimeDayBreakdown.kind, kind),
          between(wakatimeDayBreakdown.day, from, to),
        ),
      );
    return sumShares(rows, limit);
  }

  /** How many different names of a kind (languages, projects) got at least `minSeconds` in total. */
  async distinctCount(
    userId: string,
    kind: WakatimeBreakdown,
    minSeconds: number,
  ): Promise<number> {
    const shares = await this.shares(userId, kind, '0001-01-01', '9999-12-31', Infinity);
    return shares.filter((share) => share.seconds >= minSeconds).length;
  }

  today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }

  private async save(userId: string, days: WakatimeSummaryDay[]): Promise<void> {
    if (days.length === 0) {
      return;
    }
    const from = days.reduce((first, day) => (day.day < first ? day.day : first), days[0].day);
    const breakdown = days.flatMap(({ day, breakdown: items }) =>
      items.map((item) => ({ userId, day, ...item })),
    );
    const fresh = new Set(breakdown.map(({ day, kind, name }) => `${day}|${kind}|${name}`));

    await this.db.transaction(async (tx) => {
      // The same days are re-read every hour: only rows that changed are written, otherwise
      // each of them would be sent again by the sync between instances.
      await tx
        .insert(wakatimeDays)
        .values(days.map(({ day, totalSeconds }) => ({ userId, day, totalSeconds })))
        .onConflictDoUpdate({
          target: [wakatimeDays.userId, wakatimeDays.day],
          set: { totalSeconds: sql`excluded.total_seconds` },
          setWhere: sql`${wakatimeDays.totalSeconds} <> excluded.total_seconds`,
        });
      if (breakdown.length > 0) {
        await tx
          .insert(wakatimeDayBreakdown)
          .values(breakdown)
          .onConflictDoUpdate({
            target: [
              wakatimeDayBreakdown.userId,
              wakatimeDayBreakdown.day,
              wakatimeDayBreakdown.kind,
              wakatimeDayBreakdown.name,
            ],
            set: { seconds: sql`excluded.seconds` },
            setWhere: sql`${wakatimeDayBreakdown.seconds} <> excluded.seconds`,
          });
      }
      // A project renamed in WakaTime leaves a row under its old name: without this the day
      // would count that time twice.
      const saved = await tx
        .select()
        .from(wakatimeDayBreakdown)
        .where(and(eq(wakatimeDayBreakdown.userId, userId), gte(wakatimeDayBreakdown.day, from)));
      const fetchedDays = new Set(days.map((day) => day.day));
      for (const row of saved) {
        if (fetchedDays.has(row.day) && !fresh.has(`${row.day}|${row.kind}|${row.name}`)) {
          await tx
            .delete(wakatimeDayBreakdown)
            .where(
              and(
                eq(wakatimeDayBreakdown.userId, userId),
                eq(wakatimeDayBreakdown.day, row.day),
                eq(wakatimeDayBreakdown.kind, row.kind),
                eq(wakatimeDayBreakdown.name, row.name),
              ),
            );
        }
      }
    });
  }

  private async lastSavedDay(userId: string): Promise<LocalDate | null> {
    const [row] = await this.db
      .select({ day: max(wakatimeDays.day) })
      .from(wakatimeDays)
      .where(eq(wakatimeDays.userId, userId));
    return row?.day ?? null;
  }

  private async setSyncResult(userId: string, syncError: string | null): Promise<void> {
    await this.db
      .update(wakatimeSettings)
      .set({ syncError, ...(syncError ? {} : { lastSyncedAt: new Date() }) })
      .where(eq(wakatimeSettings.userId, userId));
  }
}
