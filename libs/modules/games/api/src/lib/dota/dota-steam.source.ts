import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { dotaMatches, gameAccounts, GameAccountRow } from '../games.schema';
import { SteamDotaClient, SteamListedMatch } from '../steam/steam-dota.client';
import { wholeHistory } from '../steam/steam-history';
import { SteamKeyError, SteamRateLimitError } from '../steam/steam.client';
import { DotaHeroesService } from './dota-heroes.service';

/** Rows per INSERT: five values each, far below PostgreSQL's limit of 65,535 parameters. */
const INSERT_CHUNK = 1000;
/** Details cost a request per match: this many a run, the rest waits for the next sync. */
const DETAILS_PER_RUN = 500;
/** Requests for details that go out together. */
const DETAILS_CONCURRENCY = 5;
/** So many failed requests in a row mean Steam is not answering — stop until the next sync. */
const DETAILS_FAILURES_TO_STOP = 5;

/**
 * Dota 2 matches straight from Steam — the first source of the history. Steam lists every match
 * of the account (when, on which hero) and gives the result and the numbers of each one in a
 * separate request, so the list is saved at once and the details are filled in over time.
 */
@Injectable()
export class DotaSteamSource {
  private readonly logger = new Logger(DotaSteamSource.name);
  /** Accounts whose details are being filled in right now. */
  private readonly filling = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly heroes: DotaHeroesService,
  ) {}

  /**
   * Saves the matches Steam lists. The whole history is walked on the first sync and when asked
   * by hand; otherwise the newest page is enough. Returns how many matches Steam listed.
   */
  async syncList(
    account: GameAccountRow,
    steam: SteamDotaClient,
    { full = false } = {},
  ): Promise<number> {
    const accountId = Number(account.externalId);
    const walkAll = full || !account.steamHistorySyncedAt;
    const matches = walkAll
      ? await wholeHistory(
          (query) => steam.getMatchHistory(accountId, query),
          () => this.heroes.ids(),
          (part) => this.saveListed(account.id, part),
        )
      : (await steam.getMatchHistory(accountId)).matches;
    if (!walkAll) {
      await this.saveListed(account.id, matches);
    }
    if (walkAll) {
      await this.db
        .update(gameAccounts)
        .set({ steamHistorySyncedAt: new Date() })
        .where(eq(gameAccounts.id, account.id));
    }
    return matches.length;
  }

  /**
   * Fills in the result and the numbers of the matches that do not have them yet, the newest
   * first. A match Steam has no details for is marked so it is not asked for again.
   */
  async fillDetails(account: GameAccountRow, steam: SteamDotaClient): Promise<void> {
    if (this.filling.has(account.id)) {
      return;
    }
    this.filling.add(account.id);
    try {
      const m = dotaMatches;
      const pending = await this.db
        .select({ matchId: m.matchId })
        .from(m)
        .where(and(eq(m.accountId, account.id), isNull(m.won), isNull(m.detailsCheckedAt)))
        .orderBy(desc(m.startedAt))
        .limit(DETAILS_PER_RUN);
      let failures = 0;
      for (
        let i = 0;
        i < pending.length && failures < DETAILS_FAILURES_TO_STOP;
        i += DETAILS_CONCURRENCY
      ) {
        const results = await Promise.allSettled(
          pending
            .slice(i, i + DETAILS_CONCURRENCY)
            .map(({ matchId }) => this.fillOne(account, steam, matchId)),
        );
        for (const result of results) {
          if (result.status === 'fulfilled') {
            failures = 0;
          } else if (
            result.reason instanceof SteamRateLimitError ||
            result.reason instanceof SteamKeyError
          ) {
            this.logger.warn(`Dota match details paused: ${result.reason.message}`);
            return;
          } else {
            failures++;
            this.logger.warn(`Dota match details failed: ${result.reason}`);
          }
        }
      }
    } finally {
      this.filling.delete(account.id);
    }
  }

  private async fillOne(
    account: GameAccountRow,
    steam: SteamDotaClient,
    matchId: number,
  ): Promise<void> {
    const details = await steam.getMatchDetails(matchId, Number(account.externalId));
    const m = dotaMatches;
    await this.db
      .update(m)
      // Steam answered: with the details, or with "there are none" — either way it was asked.
      .set({ ...(details ?? {}), detailsCheckedAt: new Date() })
      .where(and(eq(m.accountId, account.id), eq(m.matchId, matchId)));
  }

  /** New matches only: a saved one keeps whatever is already known about it. */
  private async saveListed(accountId: string, matches: SteamListedMatch[]): Promise<void> {
    for (let i = 0; i < matches.length; i += INSERT_CHUNK) {
      await this.db
        .insert(dotaMatches)
        .values(matches.slice(i, i + INSERT_CHUNK).map((match) => ({ accountId, ...match })))
        .onConflictDoNothing();
    }
  }
}
