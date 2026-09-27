import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { DotaHero, DotaSummary } from '@pd/contracts';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { dotaMatches, GameAccountRow } from '../games.schema';
import { DotaProfile, HeroInfo, openDota } from './opendota.client';
import { splitRankTier } from './steam-id';

/** Первая синхронизация берёт последние 100 матчей, дальше — последние 20. */
const INITIAL_MATCHES = 100;
const SYNC_MATCHES = 20;
const RECENT_MATCHES = 10;
const TOP_HEROES = 5;
const HEROES_CACHE_MS = 24 * 60 * 60 * 1000;

export interface DotaSyncResult {
  profile: DotaProfile;
  /** Медаль изменилась (только если была известна раньше). */
  rankChange: { from: number; to: number } | null;
}

@Injectable()
export class DotaService {
  private heroes: { loadedAt: number; map: Map<number, HeroInfo> } | null = null;

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Обновляет профиль и докачивает новые матчи. */
  async sync(account: GameAccountRow): Promise<DotaSyncResult> {
    const accountId = Number(account.externalId);
    const isFirstSync = account.lastSyncedAt === null;
    const [profile, matches] = await Promise.all([
      openDota.getProfile(accountId),
      openDota.getMatches(accountId, isFirstSync ? INITIAL_MATCHES : SYNC_MATCHES),
    ]);

    if (matches.length > 0) {
      await this.db
        .insert(dotaMatches)
        .values(matches.map((m) => ({ accountId: account.id, ...m })))
        .onConflictDoNothing();
    }

    // Сообщаем только о смене медали (звёзды внутри медали меняются слишком часто).
    const previousTier = (account.profile as DotaProfile | null)?.rankTier ?? null;
    const before = splitRankTier(previousTier)?.medal;
    const after = splitRankTier(profile.rankTier)?.medal;
    const rankChange =
      !isFirstSync && before !== undefined && after !== undefined && before !== after
        ? { from: previousTier as number, to: profile.rankTier as number }
        : null;

    return { profile, rankChange };
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

    const recent = await this.db
      .select()
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, account.id))
      .orderBy(desc(dotaMatches.startedAt))
      .limit(RECENT_MATCHES);

    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [last30] = await this.db
      .select({
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
        losses: sql<number>`count(*) FILTER (WHERE NOT ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .where(and(eq(dotaMatches.accountId, account.id), gt(dotaMatches.startedAt, monthAgo)));

    const topHeroes = await this.db
      .select({
        heroId: dotaMatches.heroId,
        games: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) FILTER (WHERE ${dotaMatches.won})::int`,
      })
      .from(dotaMatches)
      .where(eq(dotaMatches.accountId, account.id))
      .groupBy(dotaMatches.heroId)
      .orderBy(desc(sql`count(*)`))
      .limit(TOP_HEROES);

    return {
      game: 'dota2',
      ...profile,
      last30Days: last30 ?? { wins: 0, losses: 0 },
      recentMatches: recent.map((m) => ({
        matchId: m.matchId,
        hero: hero(m.heroId),
        won: m.won,
        kills: m.kills,
        deaths: m.deaths,
        assists: m.assists,
        durationSec: m.durationSec,
        startedAt: m.startedAt.toISOString(),
      })),
      topHeroes: topHeroes.map((h) => ({ hero: hero(h.heroId), games: h.games, wins: h.wins })),
    };
  }

  /** Справочник героев меняется редко (патчи) — кэшируем на сутки. */
  private async heroMap(): Promise<Map<number, HeroInfo>> {
    if (!this.heroes || Date.now() - this.heroes.loadedAt > HEROES_CACHE_MS) {
      this.heroes = { loadedAt: Date.now(), map: await openDota.getHeroes() };
    }
    return this.heroes.map;
  }
}
