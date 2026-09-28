import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  DOTA_MATCH_MODES,
  DOTA_RECORDS,
  DotaHero,
  DotaMatchMode,
  DotaRecord,
  dotaMatchMode,
  DotaSummary,
} from '@pd/contracts';
import { and, desc, eq, getTableColumns, gt, isNotNull, sql } from 'drizzle-orm';
import { dotaMatches, gameAccounts, GameAccountRow } from '../games.schema';
import { DotaProfile, HeroInfo, openDota, OpenDotaMatch } from './opendota.client';
import { medalChange } from './steam-id';

/** Between full downloads only the latest matches are fetched. */
const SYNC_MATCHES = 50;
const FULL_HISTORY_EVERY_MS = 24 * 60 * 60 * 1000;
/** Postgres allows 65,535 parameters per query; ~20 columns × 1000 rows stays well below. */
const INSERT_CHUNK = 1000;
const RECENT_MATCHES = 10;
const TOP_HEROES = 5;
const HEROES_CACHE_MS = 24 * 60 * 60 * 1000;

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
  private heroes: { loadedAt: number; map: Map<number, HeroInfo> } | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Updates the profile and saves matches. The whole history is downloaded on the first sync,
   * once a day and on a manual refresh — so matches OpenDota learns about later are not lost.
   */
  async sync(account: GameAccountRow, { fullHistory = false } = {}): Promise<DotaSyncResult> {
    const accountId = Number(account.externalId);
    const full = fullHistory || isHistoryStale(account);

    const [profile, matches] = await Promise.all([
      openDota.getProfile(accountId),
      openDota.getMatches(accountId, full ? undefined : SYNC_MATCHES),
    ]);
    await this.saveMatches(account.id, matches);
    if (full) {
      await this.markHistorySynced(account, profile, matches.length);
    }

    return { profile, rankChange: rankChangeSinceLastSync(account, profile) };
  }

  async summary(account: GameAccountRow): Promise<DotaSummary | null> {
    const profile = account.profile as DotaProfile | null;
    if (!profile) {
      return null;
    }
    const heroes = await this.heroMap();
    const hero = (id: number): DotaHero => ({
      id,
      name: heroes.get(id)?.name ?? `Hero #${id}`,
      imageUrl: heroes.get(id)?.imageUrl ?? '',
    });

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

  private async markHistorySynced(
    account: GameAccountRow,
    profile: DotaProfile,
    matchCount: number,
  ): Promise<void> {
    await this.db
      .update(gameAccounts)
      .set({ historySyncedAt: new Date() })
      .where(eq(gameAccounts.id, account.id));
    if (matchCount === 0 || profile.historyHidden) {
      // The history may appear after the player enables public match data — ask OpenDota to look.
      await openDota
        .requestRefresh(Number(account.externalId))
        .catch((error) => this.logger.warn(`OpenDota refresh failed: ${error}`));
    }
  }

  // An aggregate without GROUP BY always returns exactly one row, so the queries below need no
  // fallbacks for a missing row — only for NULL columns, which `coalesce` handles in SQL.

  private async totals(accountId: string): Promise<DotaSummary['totals']> {
    const [{ firstMatchAt, ...totals }] = await this.db
      .select({
        matches: sql<number>`count(*)::int`,
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

  /** Insert new matches and fill in details of already saved ones. */
  private async saveMatches(accountId: string, matches: OpenDotaMatch[]): Promise<void> {
    // `excluded.<column>` is the row that failed to insert; columns are snake_case in the database.
    const set = Object.fromEntries(
      Object.keys(getTableColumns(dotaMatches))
        .filter((key) => key !== 'accountId' && key !== 'matchId')
        .map((key) => [
          key,
          sql.raw(`excluded.${key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`),
        ]),
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
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, accountId))
      .groupBy(dotaMatches.gameMode, dotaMatches.lobbyType);

    const byMode = new Map<DotaMatchMode, { matches: number; wins: number }>();
    for (const row of rows) {
      const mode = dotaMatchMode(row.gameMode, row.lobbyType);
      const total = byMode.get(mode) ?? { matches: 0, wins: 0 };
      byMode.set(mode, { matches: total.matches + row.matches, wins: total.wins + row.wins });
    }
    return DOTA_MATCH_MODES.filter((mode) => byMode.has(mode)).map((mode) => ({
      mode,
      ...(byMode.get(mode) as { matches: number; wins: number }),
    }));
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

  /** The hero list rarely changes (patches) — cache it for a day. */
  private async heroMap(): Promise<Map<number, HeroInfo>> {
    if (!this.heroes || Date.now() - this.heroes.loadedAt > HEROES_CACHE_MS) {
      this.heroes = { loadedAt: Date.now(), map: await openDota.getHeroes() };
    }
    return this.heroes.map;
  }
}
