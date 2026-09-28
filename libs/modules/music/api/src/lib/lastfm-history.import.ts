import { Inject, Injectable, Logger } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { LastfmAuthError, LastfmClient, LastfmRecentPage } from './clients/lastfm.client';
import { LastfmService } from './lastfm.service';
import { musicSettings } from './music.schema';

/** Last.fm's maximum page size. */
const PAGE_SIZE = 200;
/** Last.fm allows about 5 requests a second; stay well below. */
const PAUSE_MS = 300;
/** Last.fm often fails a single request ("Operation failed") — retry it before giving up. */
const RETRIES = 4;
/** A background run (every 15 minutes) imports up to this many pages: 150 × 200 = 30 000 plays. */
export const PAGES_PER_BACKGROUND_RUN = 150;

export interface HistoryImportStatus {
  imported: number;
  complete: boolean;
  running: boolean;
}

/**
 * Imports the whole Last.fm history, going from the oldest stored play into the past.
 *
 * - Resumable: the cursor is the oldest play in the database, so a restart, a deploy or a failed
 *   request just continues where it stopped.
 * - Always the first page before the cursor, never deep page numbers — Last.fm fails those.
 * - New plays keep coming through `LastfmService.sync`; this only fills in the past.
 */
@Injectable()
export class LastfmHistoryImport {
  private readonly logger = new Logger(LastfmHistoryImport.name);
  /** Users whose import is running in this process. */
  private readonly running = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly lastfm: LastfmService,
  ) {}

  async status(userId: string): Promise<HistoryImportStatus> {
    const settings = await this.lastfm.getSettings(userId);
    return {
      imported: await this.lastfm.storedCount(userId),
      complete: Boolean(settings?.historyImportedAt),
      running: this.running.has(userId),
    };
  }

  /** Starts the full import in the background (the request does not wait for it). */
  start(userId: string): void {
    void this.run(userId, Infinity);
  }

  /** A portion of the import for the background job. */
  async continue(userId: string): Promise<void> {
    const settings = await this.lastfm.getSettings(userId);
    if (settings?.lastfmUsername && !settings.historyImportedAt) {
      await this.run(userId, PAGES_PER_BACKGROUND_RUN);
    }
  }

  private async run(userId: string, maxPages: number): Promise<void> {
    const client = await this.lastfm.clientFor(userId);
    if (!client || this.running.has(userId)) {
      return;
    }
    this.running.add(userId);
    try {
      await this.importPages(userId, client, maxPages);
    } catch (error) {
      // The next run continues from the oldest stored play.
      this.logger.warn(`Last.fm history import stopped for ${userId}: ${error}`);
    } finally {
      this.running.delete(userId);
    }
  }

  private async importPages(userId: string, client: LastfmClient, maxPages: number) {
    const oldest = await this.lastfm.oldestPlay(userId);
    // Last.fm takes seconds; +1 so that plays in the same second as the oldest are not skipped.
    let to = oldest ? Math.floor(oldest.getTime() / 1000) + 1 : undefined;
    for (let page = 0; page < maxPages; page++) {
      const result = await fetchWithRetries(client, to);
      const saved = await this.lastfm.save(userId, result.tracks);
      const next = nextCursor(result, to);
      if (saved === 0 || next === null) {
        await this.markComplete(userId);
        return;
      }
      to = next;
      await sleep(PAUSE_MS);
    }
  }

  private async markComplete(userId: string): Promise<void> {
    await this.db
      .update(musicSettings)
      .set({ historyImportedAt: new Date() })
      .where(eq(musicSettings.userId, userId));
    this.logger.log(`Last.fm history import complete for ${userId}`);
  }
}

/**
 * Where the next page starts: the oldest play of this page, including its second (the page may
 * end in the middle of it). If that would not move the cursor, step past the second.
 * `null` — this was the last page.
 */
export function nextCursor(page: LastfmRecentPage, to: number | undefined): number | null {
  const times = page.tracks.flatMap((t) => (t.playedAt ? [t.playedAt.getTime() / 1000] : []));
  if (times.length === 0 || (times.length < PAGE_SIZE && page.totalPages <= 1)) {
    return null;
  }
  const oldest = Math.floor(Math.min(...times));
  return oldest + 1 === to ? oldest : oldest + 1;
}

async function fetchWithRetries(
  client: LastfmClient,
  to: number | undefined,
): Promise<LastfmRecentPage> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.getRecentTracks({ to, limit: PAGE_SIZE });
    } catch (error) {
      if (error instanceof LastfmAuthError || attempt >= RETRIES) {
        throw error;
      }
      await sleep(1000 * 3 ** attempt);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
