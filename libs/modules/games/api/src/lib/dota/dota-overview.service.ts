import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import {
  DOTA_MATCH_MODES,
  DOTA_RECORDS,
  DotaAccountSummary,
  DotaHero,
  DotaListedMatch,
  DotaMatchesPage,
  DotaMatchesQuery,
  DotaMatchMode,
  dotaMatchMode,
  DotaOverview,
  DotaRecord,
} from '@pd/contracts';
import { and, asc, desc, eq, gt, inArray, isNotNull, SQL, sql } from 'drizzle-orm';
import { dotaMatches, gameAccounts, GameAccountRow } from '../games.schema';
import { DotaHeroesService } from './dota-heroes.service';
import { DotaProfile } from './opendota.client';

const RECENT_MATCHES = 15;
const ACTIVITY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

type Hero = (id: number) => DotaHero;

/**
 * The Dota page over one account or all Dota accounts of the user (like Dotabuff's player
 * overview, heroes and matches pages). Every number is computed from the stored match history.
 */
@Injectable()
export class DotaOverviewService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly heroes: DotaHeroesService,
  ) {}

  async overview(userId: string, accountId?: string): Promise<DotaOverview> {
    const accounts = await this.accounts(userId, accountId);
    const ids = accounts.map((account) => account.id);
    if (ids.length === 0) {
      return emptyOverview();
    }
    const hero = await this.heroes.resolver();
    const [totals, perAccount, modes, last30Days, records, heroes, activity, recent] =
      await Promise.all([
        this.totals(ids),
        this.perAccount(ids),
        this.modes(ids),
        this.last30Days(ids),
        this.records(ids, hero),
        this.heroStats(ids, hero),
        this.activity(ids),
        this.matchRows(ids, sql`true`, RECENT_MATCHES, 0, hero),
      ]);
    return {
      accounts: accounts.map((account) => toAccountSummary(account, perAccount.get(account.id))),
      totals,
      modes,
      last30Days,
      records,
      heroes,
      activity,
      recentMatches: recent,
    };
  }

  /** All matches, newest first, a page at a time, with the Dotabuff-like filters. */
  async matches(userId: string, query: DotaMatchesQuery): Promise<DotaMatchesPage> {
    const ids = (await this.accounts(userId, query.accountId)).map((account) => account.id);
    const { page, pageSize } = query;
    if (ids.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const m = dotaMatches;
    const filters: SQL[] = [];
    if (query.heroId) {
      filters.push(sql`${m.heroId} = ${query.heroId}`);
    }
    if (query.mode) {
      filters.push(modeFilter(query.mode));
    }
    if (query.result) {
      filters.push(query.result === 'win' ? sql`${m.won}` : sql`NOT ${m.won}`);
    }
    const where = filters.length ? sql.join(filters, sql` AND `) : sql`true`;
    const [items, total] = await Promise.all([
      this.matchRows(ids, where, pageSize, page * pageSize, await this.heroes.resolver()),
      this.db.$count(m, and(inArray(m.accountId, ids), where)),
    ]);
    return { items, total, page, pageSize };
  }

  /** The user's Dota accounts, or the one asked for (404 if it is not theirs). */
  private async accounts(userId: string, accountId?: string): Promise<GameAccountRow[]> {
    const rows = await this.db
      .select()
      .from(gameAccounts)
      .where(and(eq(gameAccounts.userId, userId), eq(gameAccounts.game, 'dota2')))
      .orderBy(asc(gameAccounts.createdAt));
    if (!accountId) {
      return rows;
    }
    const account = rows.find((row) => row.id === accountId);
    if (!account) {
      throw new NotFoundException();
    }
    return [account];
  }

  // An aggregate without GROUP BY always returns exactly one row, so no fallback for a missing
  // row is needed below — only `coalesce` for NULLs of an empty history.

  private async totals(ids: string[]): Promise<DotaOverview['totals']> {
    const m = dotaMatches;
    const [row] = await this.db
      .select({
        matches: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
        heroesPlayed: sql<number>`count(DISTINCT ${m.heroId})::int`,
        hoursPlayed: sql<number>`coalesce(round(sum(${m.durationSec}) / 3600.0), 0)::int`,
        kills: sql<number>`coalesce(sum(${m.kills}), 0)::int`,
        deaths: sql<number>`coalesce(sum(${m.deaths}), 0)::int`,
        assists: sql<number>`coalesce(sum(${m.assists}), 0)::int`,
        firstMatchAt: sql<string | null>`min(${m.startedAt})`,
        lastMatchAt: sql<string | null>`max(${m.startedAt})`,
      })
      .from(m)
      .where(inArray(m.accountId, ids));
    return { ...row, firstMatchAt: iso(row.firstMatchAt), lastMatchAt: iso(row.lastMatchAt) };
  }

  private async perAccount(ids: string[]) {
    const m = dotaMatches;
    const rows = await this.db
      .select({
        accountId: m.accountId,
        matches: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
        lastMatchAt: sql<string>`max(${m.startedAt})`,
      })
      .from(m)
      .where(inArray(m.accountId, ids))
      .groupBy(m.accountId);
    return new Map(rows.map((row) => [row.accountId, row]));
  }

  /** Matches and wins per mode; the grouping itself lives in contracts (`dotaMatchMode`). */
  private async modes(ids: string[]): Promise<DotaOverview['modes']> {
    const m = dotaMatches;
    const rows = await this.db
      .select({
        gameMode: m.gameMode,
        lobbyType: m.lobbyType,
        matches: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
      })
      .from(m)
      .where(inArray(m.accountId, ids))
      .groupBy(m.gameMode, m.lobbyType);
    const byMode = new Map<DotaMatchMode, { matches: number; wins: number }>();
    for (const row of rows) {
      const mode = dotaMatchMode(row.gameMode, row.lobbyType);
      const total = byMode.get(mode) ?? { matches: 0, wins: 0 };
      byMode.set(mode, { matches: total.matches + row.matches, wins: total.wins + row.wins });
    }
    return DOTA_MATCH_MODES.flatMap((mode) => {
      const total = byMode.get(mode);
      return total ? [{ mode, ...total }] : [];
    });
  }

  private async last30Days(ids: string[]): Promise<DotaOverview['last30Days']> {
    const m = dotaMatches;
    const [row] = await this.db
      .select({
        wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
        losses: sql<number>`count(*) FILTER (WHERE NOT ${m.won})::int`,
      })
      .from(m)
      .where(and(inArray(m.accountId, ids), gt(m.startedAt, new Date(Date.now() - 30 * DAY_MS))));
    return row;
  }

  /** The best match for each record kind, over all selected accounts. */
  private async records(ids: string[], hero: Hero): Promise<DotaOverview['records']> {
    const m = dotaMatches;
    const records = await Promise.all(
      DOTA_RECORDS.map(async (kind): Promise<(DotaRecord & { accountId: string }) | null> => {
        const column = m[kind];
        const [best] = await this.db
          .select({
            value: column,
            matchId: m.matchId,
            heroId: m.heroId,
            startedAt: m.startedAt,
            accountId: m.accountId,
          })
          .from(m)
          .where(and(inArray(m.accountId, ids), isNotNull(column)))
          .orderBy(desc(column))
          .limit(1);
        return best?.value
          ? {
              kind,
              value: best.value,
              matchId: best.matchId,
              hero: hero(best.heroId),
              startedAt: best.startedAt.toISOString(),
              accountId: best.accountId,
            }
          : null;
      }),
    );
    return records.filter((record) => record !== null);
  }

  /** Every hero played: matches, win rate, average KDA and farm, like Dotabuff's heroes table. */
  private async heroStats(ids: string[], hero: Hero): Promise<DotaOverview['heroes']> {
    const m = dotaMatches;
    const rows = await this.db
      .select({
        heroId: m.heroId,
        matches: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
        kills: sql<number>`round(avg(${m.kills}), 1)::float`,
        deaths: sql<number>`round(avg(${m.deaths}), 1)::float`,
        assists: sql<number>`round(avg(${m.assists}), 1)::float`,
        goldPerMin: sql<number | null>`round(avg(${m.goldPerMin}))::int`,
        xpPerMin: sql<number | null>`round(avg(${m.xpPerMin}))::int`,
        lastPlayedAt: sql<string>`max(${m.startedAt})`,
      })
      .from(m)
      .where(inArray(m.accountId, ids))
      .groupBy(m.heroId)
      .orderBy(desc(sql`count(*)`), asc(m.heroId));
    return rows.map(({ heroId, lastPlayedAt, ...stats }) => ({
      hero: hero(heroId),
      ...stats,
      lastPlayedAt: new Date(lastPlayedAt).toISOString(),
    }));
  }

  /** Matches per day for the activity calendar, days in the dashboard time zone. */
  private async activity(ids: string[]): Promise<DotaOverview['activity']> {
    const m = dotaMatches;
    const day = sql`to_char(${m.startedAt} AT TIME ZONE ${this.timeZone()}, 'YYYY-MM-DD')`;
    return (
      this.db
        .select({
          day: sql<string>`${day}`,
          matches: sql<number>`count(*)::int`,
          wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
        })
        .from(m)
        .where(
          and(
            inArray(m.accountId, ids),
            gt(m.startedAt, new Date(Date.now() - ACTIVITY_DAYS * DAY_MS)),
          ),
        )
        // By position: the time zone is a query parameter, so the same expression written twice
        // does not count as one for GROUP BY.
        .groupBy(sql`1`)
        .orderBy(sql`1`)
    );
  }

  private async matchRows(
    ids: string[],
    where: SQL,
    limit: number,
    offset: number,
    hero: Hero,
  ): Promise<DotaListedMatch[]> {
    const m = dotaMatches;
    const rows = await this.db
      .select()
      .from(m)
      .where(and(inArray(m.accountId, ids), where))
      .orderBy(desc(m.startedAt), desc(m.matchId))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => ({
      matchId: row.matchId,
      accountId: row.accountId,
      hero: hero(row.heroId),
      mode: dotaMatchMode(row.gameMode, row.lobbyType),
      won: row.won,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      durationSec: row.durationSec,
      startedAt: row.startedAt.toISOString(),
      goldPerMin: row.goldPerMin,
      xpPerMin: row.xpPerMin,
      lastHits: row.lastHits,
      heroDamage: row.heroDamage,
    }));
  }

  private timeZone(): string {
    return this.config.get('APP_TIMEZONE', { infer: true });
  }
}

/** The same grouping as `dotaMatchMode` in contracts, as an SQL condition. */
function modeFilter(mode: DotaMatchMode): SQL {
  const m = dotaMatches;
  const notTurbo = sql`${m.gameMode} IS DISTINCT FROM 23`;
  switch (mode) {
    case 'turbo':
      return sql`${m.gameMode} = 23`;
    case 'ranked':
      return sql`${notTurbo} AND ${m.lobbyType} = 7`;
    case 'unranked':
      return sql`${notTurbo} AND ${m.lobbyType} = 0`;
    case 'other':
      return sql`${notTurbo} AND ${m.lobbyType} IS DISTINCT FROM 7 AND ${m.lobbyType} IS DISTINCT FROM 0`;
  }
}

function toAccountSummary(
  account: GameAccountRow,
  counts: { matches: number; wins: number; lastMatchAt: string } | undefined,
): DotaAccountSummary {
  const profile = account.profile as DotaProfile | null;
  return {
    id: account.id,
    personaName: profile?.personaName ?? account.displayName,
    avatarUrl: profile?.avatarUrl ?? null,
    profileUrl: profile?.profileUrl ?? null,
    rankTier: profile?.rankTier ?? null,
    leaderboardRank: profile?.leaderboardRank ?? null,
    historyHidden: profile?.historyHidden ?? false,
    matches: counts?.matches ?? 0,
    wins: counts?.wins ?? 0,
    lastMatchAt: iso(counts?.lastMatchAt ?? null),
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    lastError: account.lastError,
  };
}

function iso(value: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

function emptyOverview(): DotaOverview {
  return {
    accounts: [],
    totals: {
      matches: 0,
      wins: 0,
      heroesPlayed: 0,
      hoursPlayed: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      firstMatchAt: null,
      lastMatchAt: null,
    },
    modes: [],
    last30Days: { wins: 0, losses: 0 },
    records: [],
    heroes: [],
    activity: [],
    recentMatches: [],
  };
}
