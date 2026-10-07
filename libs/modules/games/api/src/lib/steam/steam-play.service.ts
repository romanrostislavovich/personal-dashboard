import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, UsersService } from '@pd/api-core';
import { LocalDate, zonedDateTime } from '@pd/contracts';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { GameAccountRow, steamGames, steamPlayDays } from '../games.schema';
import { playedSince } from './steam-play';

/** Play of a game on a day. */
export interface SteamPlayDay {
  day: LocalDate;
  appId: number;
  name: string;
  minutes: number;
}

/**
 * Play time on Steam day by day. Steam keeps only the total per game, so the days are collected
 * here: each sync adds what the totals grew by to the user's current day.
 */
@Injectable()
export class SteamPlayService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  /** Called before the new totals are saved: compares them with the saved ones. */
  async record(
    account: GameAccountRow,
    games: { appId: number; playtimeMinutes: number }[],
  ): Promise<void> {
    const saved = await this.db
      .select({ appId: steamGames.appId, minutes: steamGames.playtimeMinutes })
      .from(steamGames)
      .where(eq(steamGames.accountId, account.id));
    const played = playedSince(new Map(saved.map((row) => [row.appId, row.minutes])), games);
    if (!played.length) {
      return;
    }
    const user = await this.users.findById(account.userId);
    const day = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    await this.db
      .insert(steamPlayDays)
      .values(
        played.map((game) => ({ userId: account.userId, accountId: account.id, day, ...game })),
      )
      .onConflictDoUpdate({
        target: [steamPlayDays.accountId, steamPlayDays.appId, steamPlayDays.day],
        set: { minutes: sql`${steamPlayDays.minutes} + excluded.minutes` },
      });
  }

  /** Play per day and game over a period, the newest day and the longest play first. */
  async days(userId: string, from: LocalDate, to: LocalDate): Promise<SteamPlayDay[]> {
    const d = steamPlayDays;
    return this.db
      .select({
        day: d.day,
        appId: d.appId,
        name: sql<string>`coalesce(max(${steamGames.name}), ${d.appId}::text)`,
        minutes: sql<number>`sum(${d.minutes})::int`,
      })
      .from(d)
      .leftJoin(
        steamGames,
        and(eq(steamGames.accountId, d.accountId), eq(steamGames.appId, d.appId)),
      )
      .where(and(eq(d.userId, userId), gte(d.day, from), lte(d.day, to)))
      .groupBy(d.day, d.appId)
      .orderBy(desc(d.day), desc(sql`sum(${d.minutes})`));
  }
}
