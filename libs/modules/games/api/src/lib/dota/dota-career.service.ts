import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { asc, eq, sql } from 'drizzle-orm';
import { dotaMatches, gameAccounts } from '../games.schema';
import { longestWinStreak } from './win-streak';

/** Career numbers over all Dota accounts of a user — the base for achievements. */
export interface DotaCareer {
  matches: number;
  wins: number;
  turboWins: number;
  rankedWins: number;
  heroesPlayed: number;
  maxGamesOnHero: number;
  maxKills: number;
  maxAssists: number;
  maxGoldPerMin: number;
  maxHeroDamage: number;
  maxLastHits: number;
  longestMatchMin: number;
  /** Wins without a single death (matches of 15+ minutes, so abandoned games don't count). */
  flawlessWins: number;
  /** Wins in under 20 minutes, not counting Turbo. */
  fastWins: number;
  longestWinStreak: number;
  yearsSinceFirstMatch: number;
}

/** Achievement metrics ask for the same numbers one by one — reuse them for a short while. */
const CACHE_MS = 30_000;

@Injectable()
export class DotaCareerService {
  private readonly cache = new Map<string, { at: number; career: Promise<DotaCareer> }>();

  constructor(@Inject(DB) private readonly db: Database) {}

  career(userId: string): Promise<DotaCareer> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.career;
    }
    const career = this.load(userId);
    this.cache.set(userId, { at: Date.now(), career });
    career.catch(() => this.cache.delete(userId));
    return career;
  }

  private async load(userId: string): Promise<DotaCareer> {
    const m = dotaMatches;
    const ofUser = eq(gameAccounts.userId, userId);
    const notTurbo = sql`${m.gameMode} IS DISTINCT FROM 23`;

    const [row] = await this.db
      .select({
        matches: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${m.won})::int`,
        turboWins: sql<number>`count(*) FILTER (WHERE ${m.won} AND ${m.gameMode} = 23)::int`,
        rankedWins: sql<number>`count(*) FILTER (WHERE ${m.won} AND ${m.lobbyType} = 7 AND ${notTurbo})::int`,
        heroesPlayed: sql<number>`count(DISTINCT ${m.heroId})::int`,
        maxKills: sql<number>`coalesce(max(${m.kills}), 0)::int`,
        maxAssists: sql<number>`coalesce(max(${m.assists}), 0)::int`,
        maxGoldPerMin: sql<number>`coalesce(max(${m.goldPerMin}), 0)::int`,
        maxHeroDamage: sql<number>`coalesce(max(${m.heroDamage}), 0)::int`,
        maxLastHits: sql<number>`coalesce(max(${m.lastHits}), 0)::int`,
        longestMatchMin: sql<number>`coalesce(max(${m.durationSec}) / 60, 0)::int`,
        flawlessWins: sql<number>`count(*) FILTER (WHERE ${m.won} AND ${m.deaths} = 0 AND ${m.durationSec} >= 900)::int`,
        fastWins: sql<number>`count(*) FILTER (WHERE ${m.won} AND ${m.durationSec} BETWEEN 600 AND 1199 AND ${notTurbo})::int`,
        firstMatchAt: sql<string | null>`min(${m.startedAt})`,
      })
      .from(m)
      .innerJoin(gameAccounts, eq(gameAccounts.id, m.accountId))
      .where(ofUser);

    const [hero] = await this.db
      .select({ games: sql<number>`count(*)::int` })
      .from(m)
      .innerJoin(gameAccounts, eq(gameAccounts.id, m.accountId))
      .where(ofUser)
      .groupBy(m.heroId)
      .orderBy(sql`count(*) DESC`)
      .limit(1);

    const firstMatchAt = row?.firstMatchAt ? new Date(row.firstMatchAt) : null;
    const yearMs = 365.25 * 24 * 60 * 60 * 1000;
    return {
      matches: row?.matches ?? 0,
      wins: row?.wins ?? 0,
      turboWins: row?.turboWins ?? 0,
      rankedWins: row?.rankedWins ?? 0,
      heroesPlayed: row?.heroesPlayed ?? 0,
      maxGamesOnHero: hero?.games ?? 0,
      maxKills: row?.maxKills ?? 0,
      maxAssists: row?.maxAssists ?? 0,
      maxGoldPerMin: row?.maxGoldPerMin ?? 0,
      maxHeroDamage: row?.maxHeroDamage ?? 0,
      maxLastHits: row?.maxLastHits ?? 0,
      longestMatchMin: row?.longestMatchMin ?? 0,
      flawlessWins: row?.flawlessWins ?? 0,
      fastWins: row?.fastWins ?? 0,
      longestWinStreak: await this.bestWinStreak(userId),
      yearsSinceFirstMatch: firstMatchAt
        ? Math.floor((Date.now() - firstMatchAt.getTime()) / yearMs)
        : 0,
    };
  }

  /** The best streak across all of the user's Dota accounts. */
  private async bestWinStreak(userId: string): Promise<number> {
    const rows = await this.db
      .select({ accountId: dotaMatches.accountId, won: dotaMatches.won })
      .from(dotaMatches)
      .innerJoin(gameAccounts, eq(gameAccounts.id, dotaMatches.accountId))
      .where(eq(gameAccounts.userId, userId))
      .orderBy(asc(dotaMatches.startedAt));
    const resultsByAccount = new Map<string, boolean[]>();
    for (const row of rows) {
      const results = resultsByAccount.get(row.accountId) ?? [];
      results.push(row.won);
      resultsByAccount.set(row.accountId, results);
    }
    return Math.max(0, ...[...resultsByAccount.values()].map(longestWinStreak));
  }
}
