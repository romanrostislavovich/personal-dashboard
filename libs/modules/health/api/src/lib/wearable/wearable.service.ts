import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, SecretsService, ServerKeysService } from '@pd/api-core';
import { WearableDay, WearableDaysQuery, WearableStatus } from '@pd/contracts';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import {
  GoogleHealthAuthError,
  GoogleHealthClient,
  GoogleTokens,
  MAX_RANGE_DAYS,
} from './google-health.client';
import { healthBandDays } from './band.schema';
import { healthWearableAccounts, healthWearableDays } from './wearable.schema';

const REFRESH_TOKEN_SECRET = 'health.google-health.refresh-token';
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;
/** The first sync reads this far back; Google keeps more, but older days say little now. */
const FIRST_SYNC_DAYS = 56;
/** Later syncs read the last days again: a band syncs late, and Google adds to a day for a while. */
const RESYNC_DAYS = 3;

/** The numbers of a day, in the order of the table's columns. */
const NUMBERS = [
  'steps',
  'calories',
  'distanceKm',
  'activeZoneMinutes',
  'heartRateAvg',
  'heartRateMax',
  'restingHeartRate',
  'hrvMs',
  'spo2',
  'sleepMinutes',
  'deepMinutes',
  'remMinutes',
  'lightMinutes',
  'awakeMinutes',
  'sleepStart',
  'sleepEnd',
] as const satisfies readonly (keyof WearableDay)[];

/** What only the dashboard counts, from the phone's Health Connect data (band-days.service.ts). */
const COUNTED = [
  'sleepScore',
  'stressScore',
  'resilience',
  'reactions',
  'mindfulnessMinutes',
  'skinTempDelta',
] as const satisfies readonly (keyof WearableDay)[];

/**
 * The band through the Google Health API (docs/proposals/mobile-app.md, stage 3):
 * 1. the owner sets the keys of a Google Cloud app once (Settings → Integrations);
 * 2. a user signs in with Google (`connectUrl` → `/api/medical/wearable/callback`), the refresh
 *    token is kept encrypted;
 * 3. every hour the days are read into `health_wearable_days` (WearableJob).
 */
@Injectable()
export class WearableService {
  private app: { keys: string; client: GoogleHealthClient } | null = null;
  private readonly publicUrl: string;
  // One-time states and access tokens live in memory — enough for a single API instance.
  private readonly pendingStates = new Map<string, { userId: string; expiresAt: number }>();
  private readonly accessTokens = new Map<string, GoogleTokens>();

  constructor(
    @Inject(ConfigService) config: AppConfig,
    @Inject(DB) private readonly db: Database,
    private readonly secrets: SecretsService,
    private readonly keys: ServerKeysService,
  ) {
    this.publicUrl = config.get('PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
  }

  /** The Authorized redirect URI of the app in Google Cloud. */
  get redirectUri(): string {
    return `${this.publicUrl}/api/medical/wearable/callback`;
  }

  async status(userId: string): Promise<WearableStatus> {
    const [account] = await this.db
      .select()
      .from(healthWearableAccounts)
      .where(eq(healthWearableAccounts.userId, userId));
    const [first] = await this.db
      .select({ day: sql<string | null>`min(${healthWearableDays.day})` })
      .from(healthWearableDays)
      .where(eq(healthWearableDays.userId, userId));
    const [firstOfPhone] = await this.db
      .select({ day: sql<string | null>`min(${healthBandDays.day})` })
      .from(healthBandDays)
      .where(eq(healthBandDays.userId, userId));
    return {
      available: (await this.client()) !== null,
      connected: await this.secrets.has(userId, REFRESH_TOKEN_SECRET),
      app: (await this.keys.isOwner(userId))
        ? {
            clientId: await this.keys.get('health.google-client-id'),
            redirectUri: this.redirectUri,
          }
        : null,
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
      error: account?.lastError ?? null,
      firstDay: [first?.day, firstOfPhone?.day].filter(Boolean).sort()[0] ?? null,
    };
  }

  /** Google gives no way to check the keys before a sign-in: a wrong pair fails there. */
  async setApp(clientId: string, clientSecret: string): Promise<void> {
    await this.keys.set('health.google-client-id', clientId);
    await this.keys.set('health.google-client-secret', clientSecret);
  }

  async removeApp(): Promise<void> {
    await this.keys.set('health.google-client-id', null);
    await this.keys.set('health.google-client-secret', null);
  }

  private async client(): Promise<GoogleHealthClient | null> {
    const [clientId, clientSecret] = await Promise.all([
      this.keys.get('health.google-client-id'),
      this.keys.get('health.google-client-secret'),
    ]);
    if (!clientId || !clientSecret) {
      return null;
    }
    const keys = `${clientId}:${clientSecret}`;
    if (this.app?.keys !== keys) {
      this.app = { keys, client: new GoogleHealthClient(clientId, clientSecret, this.redirectUri) };
      this.accessTokens.clear();
    }
    return this.app.client;
  }

  async connectUrl(userId: string): Promise<string> {
    const client = await this.client();
    if (!client) {
      throw new BadRequestException('Google Health is not configured on the server');
    }
    const state = randomBytes(16).toString('hex');
    this.pendingStates.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });
    return client.authorizeUrl(state);
  }

  /** Where the browser goes after the Google sign-in: back to Settings, with the result. */
  async handleCallback(code: string | undefined, state: string | undefined): Promise<string> {
    const pending = state ? this.pendingStates.get(state) : undefined;
    if (state) {
      this.pendingStates.delete(state);
    }
    const back = (result: string) =>
      `${this.publicUrl}/settings?tab=integrations&googleHealth=${result}`;
    const client = await this.client();
    if (!client || !code || !pending || pending.expiresAt < Date.now()) {
      return back('error');
    }
    try {
      const tokens = await client.exchangeCode(code);
      if (!tokens.refreshToken) {
        return back('error');
      }
      await this.saveTokens(pending.userId, tokens);
      await this.db
        .insert(healthWearableAccounts)
        .values({ userId: pending.userId })
        .onConflictDoUpdate({ target: healthWearableAccounts.userId, set: { lastError: null } });
    } catch {
      return back('error');
    }
    // The first days come at once, not with the next hour's run.
    void this.sync(pending.userId).catch(() => undefined);
    return back('connected');
  }

  async disconnect(userId: string): Promise<void> {
    this.accessTokens.delete(userId);
    await this.secrets.delete(userId, REFRESH_TOKEN_SECRET);
    await this.db.delete(healthWearableAccounts).where(eq(healthWearableAccounts.userId, userId));
  }

  async connectedUserIds(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: healthWearableAccounts.userId })
      .from(healthWearableAccounts);
    const connected = await Promise.all(
      rows.map(async (row) =>
        (await this.secrets.has(row.userId, REFRESH_TOKEN_SECRET)) ? row.userId : null,
      ),
    );
    return connected.filter((id): id is string => id !== null);
  }

  /**
   * Reads the days not read yet (the last FIRST_SYNC_DAYS the first time) and the last
   * RESYNC_DAYS again, in pieces Google allows. The outcome is kept for Settings → Integrations.
   */
  async sync(userId: string, today = new Date().toISOString().slice(0, 10)): Promise<void> {
    const client = await this.client();
    if (!client) {
      return;
    }
    try {
      const token = await this.accessToken(userId, client);
      if (!token) {
        return;
      }
      const [last] = await this.db
        .select({ day: sql<string | null>`max(${healthWearableDays.day})` })
        .from(healthWearableDays)
        .where(eq(healthWearableDays.userId, userId));
      const from = last?.day
        ? minDay(addDays(last.day, -RESYNC_DAYS + 1), addDays(today, -RESYNC_DAYS + 1))
        : addDays(today, -FIRST_SYNC_DAYS + 1);
      for (let start = from; start <= today; start = addDays(start, MAX_RANGE_DAYS)) {
        const end = minDay(addDays(start, MAX_RANGE_DAYS - 1), today);
        await this.save(userId, await client.days(token, start, end));
      }
      await this.report(userId, null);
    } catch (error) {
      if (error instanceof GoogleHealthAuthError) {
        this.accessTokens.delete(userId);
      }
      await this.report(userId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * The band's days: the Google Health API's numbers first (Google removes the duplicates of
   * several apps), the gaps filled from the phone's Health Connect, and what the dashboard
   * counts from the phone's data.
   */
  async days(userId: string, query: WearableDaysQuery): Promise<WearableDay[]> {
    const d = healthWearableDays;
    const b = healthBandDays;
    const [api, phone] = await Promise.all([
      this.db
        .select()
        .from(d)
        .where(and(eq(d.userId, userId), gte(d.day, query.from), lte(d.day, query.to))),
      this.db
        .select()
        .from(b)
        .where(and(eq(b.userId, userId), gte(b.day, query.from), lte(b.day, query.to))),
    ]);
    const byDay = new Map(api.map((row) => [row.day, row]));
    const phoneByDay = new Map(phone.map((row) => [row.day, row]));
    return [...new Set([...byDay.keys(), ...phoneByDay.keys()])].sort().map((day) => {
      const fromApi = byDay.get(day);
      // The phone has no zone minutes or SpO2: Health Connect is not told them.
      const fromPhone = phoneByDay.get(day) as Partial<Record<string, unknown>> | undefined;
      return {
        day,
        ...Object.fromEntries(
          NUMBERS.map((key) => [key, fromApi?.[key] ?? fromPhone?.[key] ?? null]),
        ),
        ...Object.fromEntries(COUNTED.map((key) => [key, fromPhone?.[key] ?? null])),
      } as WearableDay;
    });
  }

  private async save(userId: string, days: Map<string, Partial<WearableDay>>): Promise<void> {
    const rows = [...days].map(([day, numbers]) => ({
      userId,
      day,
      ...Object.fromEntries(NUMBERS.map((key) => [key, numbers[key] ?? null])),
    }));
    if (!rows.length) {
      return;
    }
    await this.db
      .insert(healthWearableDays)
      .values(rows)
      .onConflictDoUpdate({
        target: [healthWearableDays.userId, healthWearableDays.day],
        set: Object.fromEntries(NUMBERS.map((key) => [key, sql.raw(`excluded."${snake(key)}"`)])),
      });
  }

  private async report(userId: string, error: string | null): Promise<void> {
    await this.db
      .update(healthWearableAccounts)
      .set(
        error ? { lastError: error.slice(0, 500) } : { lastError: null, lastSyncedAt: new Date() },
      )
      .where(eq(healthWearableAccounts.userId, userId));
  }

  private async accessToken(userId: string, client: GoogleHealthClient): Promise<string | null> {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAt.getTime() - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
      return cached.accessToken;
    }
    const refreshToken = await this.secrets.get(userId, REFRESH_TOKEN_SECRET);
    if (!refreshToken) {
      return null;
    }
    const tokens = await client.refresh(refreshToken);
    await this.saveTokens(userId, tokens);
    return tokens.accessToken;
  }

  private async saveTokens(userId: string, tokens: GoogleTokens): Promise<void> {
    this.accessTokens.set(userId, tokens);
    if (tokens.refreshToken) {
      await this.secrets.set(userId, REFRESH_TOKEN_SECRET, tokens.refreshToken);
    }
  }
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const minDay = (a: string, b: string) => (a < b ? a : b);
const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
