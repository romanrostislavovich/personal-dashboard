import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { DOTA_RECORDS, DotaHero, DotaRecord, dotaMatchMode, DotaSummary } from '@pd/contracts';
import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { dotaMatches, gameAccounts, GameAccountRow } from '../games.schema';
import { DotaHeroesService } from './dota-heroes.service';
import { SteamDotaClient, SteamDotaPrivateError } from '../steam/steam-dota.client';
import { toSteamId64 } from '../steam/steam-id';
import { SteamKeyService } from '../steam/steam-key.service';
import { DotaSteamSource } from './dota-steam.source';
import { OpenDotaKeyService } from './opendota-key.service';
import { sumByMode } from './mode-stats';
import { DotaProfile, openDota, OpenDotaMatch } from './opendota.client';
import { medalChange } from './steam-id';

/** Between full downloads only the latest matches are fetched. */
const SYNC_MATCHES = 50;
const FULL_HISTORY_EVERY_MS = 24 * 60 * 60 * 1000;
/** Postgres allows 65,535 parameters per query; ~20 columns × 1000 rows stays well below. */
const INSERT_CHUNK = 1000;
const RECENT_MATCHES = 10;
const TOP_HEROES = 5;

export interface DotaSyncResult {
  profile: DotaProfile;
  /** The medal changed (only if it was known before). */
  rankChange: { from: number; to: number } | null;
}

/** The first sync, or the last full download was more than a day ago. */
function isHistoryStale(account: GameAccountRow): boolean {
  return (
    !account.historySyncedAt ||
    Date.now() - account.historySyncedAt.getTime() > FULL_HISTORY_EVERY_MS
  );
}

/** On the first sync there is nothing to compare the medal with. */
function rankChangeSinceLastSync(
  account: GameAccountRow,
  profile: DotaProfile,
): DotaSyncResult['rankChange'] {
  if (account.lastSyncedAt === null) {
    return null;
  }
  const previousTier = (account.profile as DotaProfile | null)?.rankTier ?? null;
  return medalChange(previousTier, profile.rankTier);
}

@Injectable()
export class DotaService {
  private readonly logger = new Logger(DotaService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly heroes: DotaHeroesService,
    private readonly keys: OpenDotaKeyService,
    private readonly steamKeys: SteamKeyService,
    private readonly steamSource: DotaSteamSource,
  ) {}

  /**
   * Updates the profile and the matches of the account from its sources.
   *
   * Steam (with the user's Web API key) comes first: it lists every match, and the result and
   * numbers of each are filled in after. OpenDota then adds what Steam does not give — the medal
   * and the fields of the matches it knows — and is the only source when there is no Steam key.
   * `fullHistory` (a manual refresh) walks the whole history again on both.
   */
  async sync(
    account: GameAccountRow,
    { fullHistory = false, awaitDetails = false } = {},
  ): Promise<DotaSyncResult> {
    const steam = await this.steamKeys.clientFor(account.userId);
    const apiKey = await this.keys.get(account.userId, account.id);

    let historyHidden = false;
    if (steam) {
      try {
        await this.steamSource.syncList(account, steam, { full: fullHistory });
      } catch (error) {
        if (!(error instanceof SteamDotaPrivateError)) {
          throw error;
        }
        historyHidden = true;
      }
    }

    // Without Steam OpenDota is all there is, and its failure is the failure of the sync.
    const fromOpenDota = await this.syncOpenDota(account, fullHistory, apiKey).catch((error) => {
      if (!steam) {
        throw error;
      }
      this.logger.warn(`OpenDota did not add to ${account.displayName}: ${error}`);
      return null;
    });

    if (steam && !historyHidden) {
      // A request per match: the hourly job waits for it, a click on the page does not.
      const filling = this.steamSource
        .fillDetails(account, steam)
        .catch((error) => this.logger.warn(`Dota match details failed: ${error}`));
      if (awaitDetails) {
        await filling;
      }
    }

    const profile = steam
      ? {
          ...(fromOpenDota ?? (await this.steamProfile(steam, account))),
          historyHidden,
        }
      : (fromOpenDota as DotaProfile);
    return { profile, rankChange: rankChangeSinceLastSync(account, profile) };
  }

  /** The profile and the matches OpenDota has; nulls never replace what is already saved. */
  private async syncOpenDota(
    account: GameAccountRow,
    fullHistory: boolean,
    apiKey: string | null,
  ): Promise<DotaProfile> {
    const accountId = Number(account.externalId);
    const full = fullHistory || isHistoryStale(account);

    const [profile, matches] = await Promise.all([
      openDota.getProfile(accountId, apiKey),
      openDota.getMatches(accountId, full ? undefined : SYNC_MATCHES, apiKey),
    ]);
    await this.saveMatches(account.id, matches);
    if (full) {
      await this.markHistorySynced(account, profile, matches.length, apiKey);
    }

    if (fullHistory) {
      // Asked for by hand: OpenDota re-reads the player from Steam, and what it finds (matches
      // it missed, a new medal) comes with the next sync.
      await this.requestRefresh(account, apiKey);
    }
    return profile;
  }

  /** The name and the picture from Steam when OpenDota did not answer; the medal stays as it was. */
  private async steamProfile(
    steam: SteamDotaClient,
    account: GameAccountRow,
  ): Promise<DotaProfile> {
    const previous = account.profile as DotaProfile | null;
    const player = await steam.getPlayer(toSteamId64(account.externalId));
    return {
      personaName: player.personaName,
      avatarUrl: player.avatarUrl,
      profileUrl: `https://www.opendota.com/players/${account.externalId}`,
      rankTier: previous?.rankTier ?? null,
      leaderboardRank: previous?.leaderboardRank ?? null,
      historyHidden: false,
    };
  }

  async summary(account: GameAccountRow): Promise<DotaSummary | null> {
    const profile = account.profile as DotaProfile | null;
    if (!profile) {
      return null;
    }
    const hero = await this.heroes.resolver();

    const [totals, last30Days, recentMatches, topHeroes, modes, records] = await Promise.all([
      this.totals(account.id),
      this.last30Days(account.id),
      this.recentMatches(account.id, hero),
      this.topHeroes(account.id, hero),
      this.modes(account.id),
      this.records(account.id, hero),
    ]);
    return {
      game: 'dota2',
      ...profile,
      historyHidden: profile.historyHidden ?? false,
      totals,
      modes,
      records,
      last30Days,
      recentMatches,
      topHeroes,
    };
  }

  /** A failed request changes nothing: the next sync simply brings what OpenDota already has. */
  private async requestRefresh(account: GameAccountRow, apiKey: string | null): Promise<void> {
    await openDota
      .requestRefresh(Number(account.externalId), apiKey)
      .catch((error) => this.logger.warn(`OpenDota refresh failed: ${error}`));
  }

  private async markHistorySynced(
    account: GameAccountRow,
    profile: DotaProfile,
    matchCount: number,
    apiKey: string | null,
  ): Promise<void> {
    await this.db
      .update(gameAccounts)
      .set({ historySyncedAt: new Date() })
      .where(eq(gameAccounts.id, account.id));
    if (matchCount === 0 || profile.historyHidden) {
      // The history may appear after the player enables public match data — ask OpenDota to look.
      await this.requestRefresh(account, apiKey);
    }
  }

  // An aggregate without GROUP BY always returns exactly one row, so the queries below need no
  // fallbacks for a missing row — only for NULL columns, which `coalesce` handles in SQL.

  private async totals(accountId: string): Promise<DotaSummary['totals']> {
    const [{ firstMatchAt, ...totals }] = await this.db
      .select({
        matches: sql<number>`count(*)::int`,
        decided: sql<number>`count(${dotaMatches.won})::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
        heroesPlayed: sql<number>`count(DISTINCT ${dotaMatches.heroId})::int`,
        hoursPlayed: sql<number>`coalesce(round(sum(${dotaMatches.durationSec}) / 3600.0), 0)::int`,
        firstMatchAt: sql<string | null>`min(${dotaMatches.startedAt})`,
      })
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, accountId));
    return { ...totals, firstMatchAt: firstMatchAt ? new Date(firstMatchAt).toISOString() : null };
  }

  private async last30Days(accountId: string): Promise<DotaSummary['last30Days']> {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [row] = await this.db
      .select({
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
        losses: sql<number>`count(*) FILTER (WHERE NOT ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .where(and(eq(dotaMatches.accountId, accountId), gt(dotaMatches.startedAt, monthAgo)));
    return row;
  }

  private async recentMatches(
    accountId: string,
    hero: (id: number) => DotaHero,
  ): Promise<DotaSummary['recentMatches']> {
    const rows = await this.db
      .select()
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, accountId))
      .orderBy(desc(dotaMatches.startedAt))
      .limit(RECENT_MATCHES);
    return rows.map((m) => ({
      matchId: m.matchId,
      hero: hero(m.heroId),
      mode: dotaMatchMode(m.gameMode, m.lobbyType),
      won: m.won,
      kills: m.kills,
      deaths: m.deaths,
      assists: m.assists,
      durationSec: m.durationSec,
      startedAt: m.startedAt.toISOString(),
    }));
  }

  private async topHeroes(
    accountId: string,
    hero: (id: number) => DotaHero,
  ): Promise<DotaSummary['topHeroes']> {
    const rows = await this.db
      .select({
        heroId: dotaMatches.heroId,
        games: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, accountId))
      .groupBy(dotaMatches.heroId)
      .orderBy(desc(sql`count(*)`))
      .limit(TOP_HEROES);
    return rows.map((h) => ({ hero: hero(h.heroId), games: h.games, wins: h.wins }));
  }

  /**
   * Inserts new matches and fills in the details of already saved ones. A value of OpenDota
   * replaces the saved one, but its `null` does not: the match may have come from Steam with
   * that field known.
   */
  private async saveMatches(accountId: string, matches: OpenDotaMatch[]): Promise<void> {
    // `excluded.<column>` is the row that failed to insert; columns are snake_case in the database.
    const set = Object.fromEntries(
      Object.keys(matches[0] ?? {})
        .filter((key) => key !== 'matchId')
        .map((key) => {
          const column = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
          return [key, sql.raw(`coalesce(excluded.${column}, "games_dota_matches".${column})`)];
        }),
    );
    for (let i = 0; i < matches.length; i += INSERT_CHUNK) {
      await this.db
        .insert(dotaMatches)
        .values(matches.slice(i, i + INSERT_CHUNK).map((m) => ({ accountId, ...m })))
        .onConflictDoUpdate({ target: [dotaMatches.accountId, dotaMatches.matchId], set });
    }
  }

  /** Matches and wins per mode; the grouping itself lives in contracts (`dotaMatchMode`). */
  private async modes(accountId: string): Promise<DotaSummary['modes']> {
    const rows = await this.db
      .select({
        gameMode: dotaMatches.gameMode,
        lobbyType: dotaMatches.lobbyType,
        matches: sql<number>`count(*)::int`,
        decided: sql<number>`count(${dotaMatches.won})::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, accountId))
      .groupBy(dotaMatches.gameMode, dotaMatches.lobbyType);

    return sumByMode(rows);
  }

  /** The best match for each record kind; the queries are independent, so they run together. */
  private async records(accountId: string, hero: (id: number) => DotaHero): Promise<DotaRecord[]> {
    const records = await Promise.all(
      DOTA_RECORDS.map(async (kind): Promise<DotaRecord | null> => {
        const column = dotaMatches[kind];
        const [best] = await this.db
          .select({
            value: column,
            matchId: dotaMatches.matchId,
            heroId: dotaMatches.heroId,
            startedAt: dotaMatches.startedAt,
          })
          .from(dotaMatches)
          .where(and(eq(dotaMatches.accountId, accountId), isNotNull(column)))
          .orderBy(desc(column))
          .limit(1);
        return best?.value
          ? {
              kind,
              value: best.value,
              matchId: best.matchId,
              hero: hero(best.heroId),
              startedAt: best.startedAt.toISOString(),
            }
          : null;
      }),
    );
    return records.filter((record) => record !== null);
  }
}
