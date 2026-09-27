import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DB, Database, NotificationsService, UsersService } from '@pd/api-core';
import { GameAccount, GameAccountInput } from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { DotaProfileNotFoundError } from './dota/opendota.client';
import { DotaService } from './dota/dota.service';
import { parseDotaAccountId } from './dota/steam-id';
import { gameAccounts, GameAccountRow } from './games.schema';
import { gamesMessages } from './games.messages';
import { WowCharacterNotFoundError } from './wow/battlenet.client';
import { toWowExternalId, WowService } from './wow/wow.service';

@Injectable()
export class GameAccountsService {
  private readonly logger = new Logger(GameAccountsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly dota: DotaService,
    private readonly wow: WowService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string): Promise<GameAccount[]> {
    const rows = await this.db
      .select()
      .from(gameAccounts)
      .where(eq(gameAccounts.userId, userId))
      .orderBy(asc(gameAccounts.createdAt));
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        game: row.game,
        displayName: row.displayName,
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        lastError: row.lastError,
        summary: row.game === 'dota2' ? await this.dota.summary(row) : await this.wow.summary(row),
      })),
    );
  }

  /** Adds an account and syncs it right away; a non-existent account is not saved. */
  async add(userId: string, input: GameAccountInput): Promise<void> {
    const { externalId, displayName } = this.identify(input);
    const [row] = await this.db
      .insert(gameAccounts)
      .values({ userId, game: input.game, externalId, displayName })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      throw new ConflictException('Account is already added');
    }
    try {
      await this.syncAccount(row, { throwErrors: true });
    } catch (error) {
      await this.remove(userId, row.id);
      if (error instanceof DotaProfileNotFoundError || error instanceof WowCharacterNotFoundError) {
        throw new BadRequestException('Account not found');
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(gameAccounts)
      .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, userId)));
  }

  async syncOne(userId: string, id: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(gameAccounts)
      .where(and(eq(gameAccounts.id, id), eq(gameAccounts.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    await this.syncAccount(row);
  }

  /** Background sync of all accounts; news goes to notifications. */
  async syncAll(): Promise<void> {
    for (const row of await this.db.select().from(gameAccounts)) {
      await this.syncAccount(row);
    }
  }

  private async syncAccount(row: GameAccountRow, { throwErrors = false } = {}): Promise<void> {
    try {
      const news = row.game === 'dota2' ? await this.syncDota(row) : await this.syncWow(row);
      if (news.length > 0) {
        await this.notify(row.userId, news);
      }
    } catch (error) {
      if (throwErrors) {
        throw error;
      }
      this.logger.warn(`Sync of ${row.game} account ${row.displayName} failed: ${error}`);
      await this.db
        .update(gameAccounts)
        .set({ lastError: error instanceof Error ? error.message : String(error) })
        .where(eq(gameAccounts.id, row.id));
    }
  }

  private async syncDota(row: GameAccountRow): Promise<string[]> {
    const { profile, rankChange } = await this.dota.sync(row);
    await this.saveProfile(row, profile.personaName, { ...profile });
    const text = gamesMessages(await this.localeOf(row.userId));
    return rankChange ? [text.dotaRank(profile.personaName, rankChange.from, rankChange.to)] : [];
  }

  private async syncWow(row: GameAccountRow): Promise<string[]> {
    const { profile, newAchievements } = await this.wow.sync(row);
    await this.saveProfile(row, `${profile.name} — ${profile.realm}`, { ...profile });
    const text = gamesMessages(await this.localeOf(row.userId));
    return newAchievements.map((a) => text.wowAchievement(profile.name, a.name));
  }

  private async saveProfile(
    row: GameAccountRow,
    displayName: string,
    profile: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .update(gameAccounts)
      .set({ displayName, profile, lastSyncedAt: new Date(), lastError: null })
      .where(eq(gameAccounts.id, row.id));
  }

  private async notify(userId: string, lines: string[]): Promise<void> {
    const text = gamesMessages(await this.localeOf(userId));
    await this.notifications.send(userId, {
      title: text.title,
      body: lines.join('\n'),
      source: 'games',
    });
  }

  private async localeOf(userId: string): Promise<string> {
    return (await this.users.findById(userId))?.locale ?? 'en';
  }

  /** External id and name before the first sync. */
  private identify(input: GameAccountInput): { externalId: string; displayName: string } {
    if (input.game === 'dota2') {
      const accountId = parseDotaAccountId(input.steamId);
      if (!accountId) {
        throw new BadRequestException('Cannot find a Steam account id in the input');
      }
      return { externalId: String(accountId), displayName: String(accountId) };
    }
    return { externalId: toWowExternalId(input), displayName: `${input.name} — ${input.realm}` };
  }
}
