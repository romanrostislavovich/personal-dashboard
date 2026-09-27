import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DB, Database, SecretsService } from '@pd/api-core';
import { WowCredentialsInput, WowRegion, WowSummary } from '@pd/contracts';
import { desc, eq, sql } from 'drizzle-orm';
import { GameAccountRow, wowAchievements } from '../games.schema';
import {
  BattlenetAuthError,
  BattlenetClient,
  WowCharacterRef,
  WowCompletedAchievement,
  WowProfile,
} from './battlenet.client';

const CREDENTIALS_SECRET = 'games.wow.credentials';
const RECENT_ACHIEVEMENTS = 10;

export interface WowSyncResult {
  profile: WowProfile;
  /** Ачивки, полученные с прошлой синхронизации (при первой — пусто). */
  newAchievements: WowCompletedAchievement[];
}

@Injectable()
export class WowService {
  constructor(
    @Inject(DB) private readonly db: Database,
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

  /** Обновляет профиль и сохраняет полученные ачивки. */
  async sync(account: GameAccountRow): Promise<WowSyncResult> {
    const client = await this.clientFor(account.userId);
    const ref = parseRef(account.externalId);
    const [profile, completed] = await Promise.all([
      client.getProfile(ref),
      client.getCompletedAchievements(ref),
    ]);

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

    // При первой синхронизации «новые» — вообще все ачивки; про них не уведомляем.
    const isFirstSync = account.lastSyncedAt === null;
    const insertedIds = new Set(inserted.map((row) => row.achievementId));
    return {
      profile,
      newAchievements: isFirstSync ? [] : completed.filter((a) => insertedIds.has(a.id)),
    };
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

    return {
      game: 'wow',
      ...profile,
      totalAchievements: total,
      recentAchievements: recent.map((a) => ({
        id: a.achievementId,
        name: a.name,
        completedAt: a.completedAt.toISOString(),
      })),
    };
  }
}

/** `externalId` WoW-аккаунта хранится как `region/realm/name`. */
export function toWowExternalId(ref: WowCharacterRef): string {
  return `${ref.region}/${ref.realm}/${ref.name.toLowerCase()}`;
}

function parseRef(externalId: string): WowCharacterRef {
  const [region, realm, name] = externalId.split('/');
  return { region: region as WowRegion, realm, name };
}
