import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, SecretsService } from '@pd/api-core';
import {
  addDays,
  todayIn,
  toLocalDate,
  WowCredentialsInput,
  WowDetails,
  WowRegion,
  WowSummary,
  WowToken,
  WowVersion,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { gameAccounts, GameAccountRow, wowAchievements } from '../games.schema';
import {
  BattlenetAuthError,
  BattlenetClient,
  WowCharacterRef,
  WowCompletedAchievement,
  WowProfile,
} from './battlenet.client';

import { WowNews, wowNews } from './wow-news';
import { wowDays, wowDetails, wowTokenDays } from './wow.schema';

const CREDENTIALS_SECRET = 'games.wow.credentials';
const RECENT_ACHIEVEMENTS = 10;
const HISTORY_DAYS = 90;

export interface WowSyncResult {
  profile: WowProfile;
  /** Achievements earned since the last sync (empty on the first one). */
  newAchievements: WowCompletedAchievement[];
  /** A better rating, a boss killed, something new in a collection — for a notification. */
  news: WowNews[];
}

@Injectable()
export class WowService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly secrets: SecretsService,
  ) {}

  hasCredentials(userId: string): Promise<boolean> {
    return this.secrets.has(userId, CREDENTIALS_SECRET);
  }

  async saveCredentials(userId: string, input: WowCredentialsInput): Promise<void> {
    try {
      await new BattlenetClient(input.clientId, input.clientSecret).verify();
    } catch (error) {
      if (error instanceof BattlenetAuthError) {
        throw new BadRequestException('Invalid Battle.net credentials');
      }
      throw error;
    }
    await this.secrets.set(userId, CREDENTIALS_SECRET, JSON.stringify(input));
  }

  async clientFor(userId: string): Promise<BattlenetClient> {
    const stored = await this.secrets.get(userId, CREDENTIALS_SECRET);
    if (!stored) {
      throw new BadRequestException('Battle.net credentials are not set');
    }
    const { clientId, clientSecret } = JSON.parse(stored) as WowCredentialsInput;
    return new BattlenetClient(clientId, clientSecret);
  }

  /**
   * Updates the character: the profile, everything about it (gear, Mythic+, raids…), today's
   * point of the history, earned achievements, and the price of the token in its region.
   */
  async sync(account: GameAccountRow): Promise<WowSyncResult> {
    const client = await this.clientFor(account.userId);
    const ref = parseRef(account.externalId);
    const [{ profile, details }, completed] = await Promise.all([
      client.getCharacter(ref),
      client.getCompletedAchievements(ref),
    ]);
    const news = await this.saveDetails(account, profile, details);
    if (ref.version === 'retail') {
      // The token of Classic is a different one; only the current game's is followed.
      await this.saveTokenPrice(account.userId, ref.region, client);
    }

    const inserted =
      completed.length > 0
        ? await this.db
            .insert(wowAchievements)
            .values(
              completed.map((a) => ({
                accountId: account.id,
                achievementId: a.id,
                name: a.name,
                completedAt: a.completedAt,
              })),
            )
            .onConflictDoNothing()
            .returning({ achievementId: wowAchievements.achievementId })
        : [];

    // On the first sync every achievement is "new"; no notification for those.
    const isFirstSync = account.lastSyncedAt === null;
    const insertedIds = new Set(inserted.map((row) => row.achievementId));
    return {
      profile,
      newAchievements: isFirstSync ? [] : completed.filter((a) => insertedIds.has(a.id)),
      news,
    };
  }

  /** Switches the notifications of one character. */
  async setNotify(userId: string, accountId: string, notify: boolean): Promise<void> {
    const [account] = await this.db
      .select({ id: gameAccounts.id })
      .from(gameAccounts)
      .where(and(eq(gameAccounts.id, accountId), eq(gameAccounts.userId, userId)));
    const [row] = account
      ? await this.db
          .update(wowDetails)
          .set({ notify })
          .where(eq(wowDetails.accountId, accountId))
          .returning({ accountId: wowDetails.accountId })
      : [];
    if (!row) {
      throw new NotFoundException('Character not found');
    }
  }

  /** The price of the WoW Token with its history, for each region the user has characters in. */
  async tokens(userId: string): Promise<WowToken[]> {
    const rows = await this.db
      .select()
      .from(wowTokenDays)
      .where(eq(wowTokenDays.userId, userId))
      .orderBy(asc(wowTokenDays.day));
    const byRegion = new Map<string, typeof rows>();
    for (const row of rows) {
      byRegion.set(row.region, [...(byRegion.get(row.region) ?? []), row]);
    }
    return [...byRegion.entries()].map(([region, days]) => {
      const latest = days[days.length - 1];
      return {
        region,
        price: latest.price,
        updatedAt: latest.updatedAt.toISOString(),
        history: days.map(({ day, price }) => ({ day, price })),
      };
    });
  }

  /**
   * Saves the snapshot and today's point. Returns the news against the previous snapshot —
   * nothing on the first one, and nothing when the user switched the character's news off.
   */
  private async saveDetails(
    account: GameAccountRow,
    profile: WowProfile,
    details: WowDetails,
  ): Promise<WowNews[]> {
    const [previous] = await this.db
      .select()
      .from(wowDetails)
      .where(eq(wowDetails.accountId, account.id));
    await this.db
      .insert(wowDetails)
      .values({ accountId: account.id, details })
      .onConflictDoUpdate({
        target: wowDetails.accountId,
        set: { details, updatedAt: new Date() },
        // Read every half an hour: a character that did not change stays untouched, otherwise
        // the row would be sent again by the sync between instances.
        setWhere: sql`${wowDetails.details} IS DISTINCT FROM ${JSON.stringify(details)}::jsonb`,
      });

    const point = {
      itemLevel: profile.itemLevel,
      mythicRating: details.mythic?.rating ?? null,
      achievementPoints: profile.achievementPoints,
      mounts: details.collections.mounts,
      pets: details.collections.pets,
      toys: details.collections.toys,
    };
    const d = wowDays;
    await this.db
      .insert(d)
      .values({ accountId: account.id, day: this.today(), ...point })
      .onConflictDoUpdate({
        target: [d.accountId, d.day],
        set: point,
        setWhere: sql`(${d.itemLevel}, ${d.mythicRating}, ${d.achievementPoints}, ${d.mounts}, ${d.pets}, ${d.toys})
          IS DISTINCT FROM (excluded.item_level, excluded.mythic_rating, excluded.achievement_points, excluded.mounts, excluded.pets, excluded.toys)`,
      });
    return previous?.notify ? wowNews(previous.details, details) : [];
  }

  /** One point a day per region; a failure here must not fail the character. */
  private async saveTokenPrice(
    userId: string,
    region: WowRegion,
    client: BattlenetClient,
  ): Promise<void> {
    const token = await client.getTokenPrice(region);
    if (!token) {
      return;
    }
    const t = wowTokenDays;
    await this.db
      .insert(t)
      .values({ userId, region, day: this.today(), ...token })
      .onConflictDoUpdate({
        target: [t.userId, t.region, t.day],
        set: token,
        setWhere: sql`${t.price} <> excluded.price`,
      });
  }

  private today(): string {
    return toLocalDate(todayIn(this.config.get('APP_TIMEZONE', { infer: true })));
  }

  async summary(account: GameAccountRow): Promise<WowSummary | null> {
    const profile = account.profile as WowProfile | null;
    if (!profile) {
      return null;
    }
    const recent = await this.db
      .select()
      .from(wowAchievements)
      .where(eq(wowAchievements.accountId, account.id))
      .orderBy(desc(wowAchievements.completedAt))
      .limit(RECENT_ACHIEVEMENTS);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(wowAchievements)
      .where(eq(wowAchievements.accountId, account.id));

    const [extra] = await this.db
      .select()
      .from(wowDetails)
      .where(eq(wowDetails.accountId, account.id));
    const since = toLocalDate(
      addDays(todayIn(this.config.get('APP_TIMEZONE', { infer: true })), -HISTORY_DAYS),
    );
    const history = await this.db
      .select()
      .from(wowDays)
      .where(and(eq(wowDays.accountId, account.id), gte(wowDays.day, since)))
      .orderBy(asc(wowDays.day));

    return {
      game: 'wow',
      version: parseRef(account.externalId).version,
      details: extra?.details ?? null,
      history: history.map(({ accountId: _accountId, ...point }) => point),
      notify: extra?.notify ?? true,
      ...profile,
      // Profiles saved before the class id was stored get it with the next sync.
      classId: profile.classId ?? null,
      totalAchievements: total,
      recentAchievements: recent.map((a) => ({
        id: a.achievementId,
        name: a.name,
        completedAt: a.completedAt.toISOString(),
      })),
    };
  }
}

/**
 * A WoW account's `externalId` is `region/realm/name` for the current game (as it always was)
 * and `region/realm/name/version` for a Classic one.
 */
export function toWowExternalId(ref: WowCharacterRef): string {
  const id = `${ref.region}/${ref.realm}/${ref.name.toLowerCase()}`;
  return ref.version === 'retail' ? id : `${id}/${ref.version}`;
}

export function parseRef(externalId: string): WowCharacterRef {
  const [region, realm, name, version] = externalId.split('/');
  return {
    region: region as WowRegion,
    realm,
    name,
    version: (version as WowVersion | undefined) ?? 'retail',
  };
}
