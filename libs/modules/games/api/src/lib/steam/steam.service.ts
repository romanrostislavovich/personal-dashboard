import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { SteamGame, SteamSummary } from '@pd/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import { GameAccountRow, steamGames } from '../games.schema';
import { parseSteamReference } from './steam-id';
import { SteamKeyService } from './steam-key.service';
import { SteamClient, SteamOwnedGame, SteamPlayer, SteamRateLimitError } from './steam.client';

/** Achievements are asked per game: this many games a sync, the rest waits for the next one. */
const ACHIEVEMENT_GAMES_PER_SYNC = 60;
/** Rows per INSERT: seven values each, far below PostgreSQL's limit of 65,535 parameters. */
const INSERT_CHUNK = 1000;
/** Games shown on the page: the most played ones. */
const TOP_GAMES = 100;

/** The saved snapshot of a Steam profile (see `gameAccounts.profile`). */
export interface SteamProfile {
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string;
  level: number | null;
  createdAt: string | null;
  /** "Game details" of the profile are not public: Steam does not tell the library. */
  gamesHidden: boolean;
}

/** A Steam account: the profile, the library with playtime and achievements per game. */
@Injectable()
export class SteamService {
  private readonly logger = new Logger(SteamService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly keys: SteamKeyService,
  ) {}

  /** The Steam ID64 of what the user pasted; a custom address is resolved by Steam. */
  async resolveSteamId(userId: string, input: string): Promise<string> {
    const reference = parseSteamReference(input);
    if (!reference) {
      throw new BadRequestException('Cannot find a Steam profile in the input');
    }
    if ('steamId' in reference) {
      return reference.steamId;
    }
    const steamId = await (await this.client(userId)).resolveVanity(reference.vanity);
    if (!steamId) {
      throw new BadRequestException('Steam profile not found');
    }
    return steamId;
  }

  /** Reads the profile and the library from Steam and saves them. */
  async sync(account: GameAccountRow): Promise<SteamProfile> {
    const client = await this.client(account.userId);
    const steamId = account.externalId;
    const [player, level, games] = await Promise.all([
      client.getPlayer(steamId),
      client.getLevel(steamId),
      client.getOwnedGames(steamId),
    ]);
    if (games) {
      await this.saveGames(account.id, games);
      await this.syncAchievements(account.id, steamId, client);
    }
    return toProfile(player, level, games === null);
  }

  async summary(account: GameAccountRow): Promise<SteamSummary | null> {
    const profile = account.profile as SteamProfile | null;
    if (!profile) {
      return null;
    }
    const g = steamGames;
    const [totals] = await this.db
      .select({
        games: sql<number>`count(*)::int`,
        played: sql<number>`count(*) FILTER (WHERE ${g.playtimeMinutes} > 0)::int`,
        minutes: sql<number>`coalesce(sum(${g.playtimeMinutes}), 0)::int`,
        minutes2Weeks: sql<number>`coalesce(sum(${g.playtime2WeeksMinutes}), 0)::int`,
        achievements: sql<number>`coalesce(sum(${g.achievementsUnlocked}), 0)::int`,
      })
      .from(g)
      .where(eq(g.accountId, account.id));
    const rows = await this.db
      .select()
      .from(g)
      .where(and(eq(g.accountId, account.id), sql`${g.playtimeMinutes} > 0`))
      .orderBy(desc(g.playtimeMinutes))
      .limit(TOP_GAMES);

    return {
      game: 'steam',
      ...profile,
      totals,
      games: rows.map((row): SteamGame => ({
        appId: row.appId,
        name: row.name,
        iconHash: row.iconHash,
        minutes: row.playtimeMinutes,
        minutes2Weeks: row.playtime2WeeksMinutes,
        lastPlayedAt: row.lastPlayedAt?.toISOString() ?? null,
        achievements:
          row.achievementsTotal === null || row.achievementsUnlocked === null
            ? null
            : { unlocked: row.achievementsUnlocked, total: row.achievementsTotal },
      })),
    };
  }

  private async client(userId: string): Promise<SteamClient> {
    const client = await this.keys.clientFor(userId);
    if (!client) {
      throw new BadRequestException('Steam Web API key is not set');
    }
    return client;
  }

  private async saveGames(accountId: string, games: SteamOwnedGame[]): Promise<void> {
    const g = steamGames;
    for (let i = 0; i < games.length; i += INSERT_CHUNK) {
      await this.db
        .insert(g)
        .values(games.slice(i, i + INSERT_CHUNK).map((game) => ({ accountId, ...game })))
        .onConflictDoUpdate({
          target: [g.accountId, g.appId],
          set: {
            name: sql`excluded.name`,
            iconHash: sql`excluded.icon_hash`,
            playtimeMinutes: sql`excluded.playtime_minutes`,
            playtime2WeeksMinutes: sql`excluded.playtime2_weeks_minutes`,
            lastPlayedAt: sql`excluded.last_played_at`,
          },
          // A library of hundreds of games is re-read every half an hour: a game that was not
          // played stays untouched, otherwise each row would be sent again by the sync.
          setWhere: sql`(${g.name}, ${g.iconHash}, ${g.playtimeMinutes}, ${g.playtime2WeeksMinutes}, ${g.lastPlayedAt})
            IS DISTINCT FROM (excluded.name, excluded.icon_hash, excluded.playtime_minutes, excluded.playtime2_weeks_minutes, excluded.last_played_at)`,
        });
    }
  }

  /**
   * Achievements cost a request per game, so only games played since they were last read are
   * asked for — the most played first, a limited number a sync.
   */
  private async syncAchievements(
    accountId: string,
    steamId: string,
    client: SteamClient,
  ): Promise<void> {
    const g = steamGames;
    const stale = await this.db
      .select({ appId: g.appId, playtimeMinutes: g.playtimeMinutes })
      .from(g)
      .where(
        and(
          eq(g.accountId, accountId),
          sql`${g.playtimeMinutes} > 0`,
          sql`${g.achievementsPlaytime} IS DISTINCT FROM ${g.playtimeMinutes}`,
        ),
      )
      .orderBy(desc(g.playtimeMinutes))
      .limit(ACHIEVEMENT_GAMES_PER_SYNC);

    for (const game of stale) {
      try {
        const count = await client.getAchievements(steamId, game.appId);
        await this.db
          .update(g)
          .set({
            achievementsUnlocked: count?.unlocked ?? null,
            achievementsTotal: count?.total ?? null,
            achievementsPlaytime: game.playtimeMinutes,
          })
          .where(and(eq(g.accountId, accountId), eq(g.appId, game.appId)));
      } catch (error) {
        if (error instanceof SteamRateLimitError) {
          this.logger.warn(`Steam achievements paused: ${error.message}`);
          return;
        }
        // One game failing (a removed app, a timeout) does not stop the others.
        this.logger.warn(`Steam achievements of app ${game.appId} failed: ${error}`);
      }
    }
  }
}

function toProfile(player: SteamPlayer, level: number | null, gamesHidden: boolean): SteamProfile {
  return {
    personaName: player.personaName,
    avatarUrl: player.avatarUrl,
    profileUrl: player.profileUrl,
    level,
    createdAt: player.createdAt,
    gamesHidden,
  };
}
