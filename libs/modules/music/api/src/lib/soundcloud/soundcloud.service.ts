import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, SecretsService } from '@pd/api-core';
import {
  addDays,
  DateParts,
  SoundcloudConnectInput,
  soundcloudProfileName,
  SoundcloudSettings,
  SoundcloudStats,
  SoundcloudTrack,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
import { growth, trackNews, TrackNews } from './soundcloud-news';
import {
  SoundcloudAuthError,
  SoundcloudClient,
  SoundcloudNotFoundError,
  SoundcloudTrackSnapshot,
  SoundcloudUser,
} from './soundcloud.client';
import {
  soundcloudAccountDays,
  soundcloudAccounts,
  soundcloudTrackDays,
  SoundcloudTrackRow,
  soundcloudTracks,
} from './soundcloud.schema';

const TOKEN_KEY = 'music.soundcloud.token';
const HISTORY_DAYS = 30;

/** What a sync found worth telling: the tracks' news and the new followers. */
export interface SoundcloudNews {
  tracks: TrackNews[];
  newFollowers: number;
}

type TrackDay = typeof soundcloudTrackDays.$inferSelect;

/**
 * The user's own tracks on SoundCloud. SoundCloud gives only the current counters, so each sync
 * saves them per day — the history starts on the day the profile is connected.
 */
@Injectable()
export class SoundcloudService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly secrets: SecretsService,
  ) {}

  async settings(userId: string): Promise<SoundcloudSettings> {
    const [account] = await this.db
      .select()
      .from(soundcloudAccounts)
      .where(eq(soundcloudAccounts.userId, userId));
    return {
      username: account?.username ?? null,
      withToken: await this.secrets.has(userId, TOKEN_KEY),
      lastSyncedAt: account?.lastSyncedAt?.toISOString() ?? null,
      lastError: account?.lastError ?? null,
    };
  }

  async connectedUserIds(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: soundcloudAccounts.userId })
      .from(soundcloudAccounts);
    return rows.map((row) => row.userId);
  }

  /** Finds the profile, checks the token against it and loads the tracks right away. */
  async connect(userId: string, input: SoundcloudConnectInput): Promise<void> {
    const username = soundcloudProfileName(input.profile);
    if (!username) {
      throw new BadRequestException('Expected a SoundCloud profile');
    }
    const token = input.token || null;
    const client = new SoundcloudClient(token);
    let user: SoundcloudUser;
    try {
      user = await client.resolveUser(username);
      // Private tracks are listed only for their owner: the token must be of this profile.
      if (token && (await client.me()).id !== user.id) {
        throw new BadRequestException('The token belongs to another SoundCloud account');
      }
    } catch (error) {
      if (error instanceof SoundcloudNotFoundError || error instanceof SoundcloudAuthError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    const account = {
      soundcloudId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      permalinkUrl: user.permalinkUrl,
      followers: user.followers,
      lastError: null,
    };
    await this.db
      .insert(soundcloudAccounts)
      .values({ userId, ...account })
      .onConflictDoUpdate({ target: soundcloudAccounts.userId, set: account });
    if (token) {
      await this.secrets.set(userId, TOKEN_KEY, token);
    } else {
      await this.secrets.delete(userId, TOKEN_KEY);
    }
    await this.sync(userId);
  }

  /** Forgets the profile, its tracks and their history. */
  async disconnect(userId: string): Promise<void> {
    await this.secrets.delete(userId, TOKEN_KEY);
    await this.db.transaction(async (tx) => {
      await tx.delete(soundcloudTracks).where(eq(soundcloudTracks.userId, userId));
      await tx.delete(soundcloudAccountDays).where(eq(soundcloudAccountDays.userId, userId));
      await tx.delete(soundcloudAccounts).where(eq(soundcloudAccounts.userId, userId));
    });
  }

  async setNotify(userId: string, trackId: string, notify: boolean): Promise<void> {
    const [row] = await this.db
      .update(soundcloudTracks)
      .set({ notify })
      .where(and(eq(soundcloudTracks.id, trackId), eq(soundcloudTracks.userId, userId)))
      .returning({ id: soundcloudTracks.id });
    if (!row) {
      throw new NotFoundException('Track not found');
    }
  }

  /**
   * Reads the profile and its tracks, saves today's counters. Returns what is worth telling;
   * the first sync of a track tells nothing — there is nothing to compare with.
   */
  async sync(userId: string): Promise<SoundcloudNews> {
    const [account] = await this.db
      .select()
      .from(soundcloudAccounts)
      .where(eq(soundcloudAccounts.userId, userId));
    if (!account) {
      throw new BadRequestException('SoundCloud is not connected');
    }
    try {
      const client = new SoundcloudClient(await this.secrets.get(userId, TOKEN_KEY));
      const user = await client.getUser(account.soundcloudId);
      const tracks = await client.listTracks(account.soundcloudId);
      const news = await this.save(userId, user, tracks);
      return {
        tracks: news,
        // The first sync has no earlier number to compare with.
        newFollowers: account.lastSyncedAt ? Math.max(0, user.followers - account.followers) : 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(soundcloudAccounts)
        .set({ lastError: message })
        .where(eq(soundcloudAccounts.userId, userId));
      // The page shows SoundCloud's own explanation (an expired token, a changed site).
      throw error instanceof HttpException ? error : new BadRequestException(message);
    }
  }

  /** `null` — SoundCloud is not connected. */
  async stats(userId: string): Promise<SoundcloudStats | null> {
    const [account] = await this.db
      .select()
      .from(soundcloudAccounts)
      .where(eq(soundcloudAccounts.userId, userId));
    if (!account) {
      return null;
    }
    const today = this.today();
    const from = toLocalDate(addDays(today, -HISTORY_DAYS));
    const rows = await this.db
      .select()
      .from(soundcloudTracks)
      .where(eq(soundcloudTracks.userId, userId))
      .orderBy(desc(soundcloudTracks.plays), asc(soundcloudTracks.title));
    const days = rows.length
      ? await this.db
          .select()
          .from(soundcloudTrackDays)
          .where(
            and(
              inArray(
                soundcloudTrackDays.trackId,
                rows.map((row) => row.id),
              ),
              gte(soundcloudTrackDays.day, from),
            ),
          )
          .orderBy(asc(soundcloudTrackDays.day))
      : [];
    const byTrack = new Map<string, TrackDay[]>();
    for (const day of days) {
      byTrack.set(day.trackId, [...(byTrack.get(day.trackId) ?? []), day]);
    }
    const tracks = rows.map((row) => toTrack(row, byTrack.get(row.id) ?? [], today));
    const followerDays = await this.db
      .select()
      .from(soundcloudAccountDays)
      .where(and(eq(soundcloudAccountDays.userId, userId), gte(soundcloudAccountDays.day, from)))
      .orderBy(asc(soundcloudAccountDays.day));
    const [since] = await this.db
      .select({ day: sql<string | null>`min(${soundcloudAccountDays.day})` })
      .from(soundcloudAccountDays)
      .where(eq(soundcloudAccountDays.userId, userId));

    return {
      username: account.username,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      permalinkUrl: account.permalinkUrl,
      followers: account.followers,
      followersWeek: growth(
        followerDays.map((day) => ({ day: day.day, value: day.followers })),
        account.followers,
        today,
        7,
      ),
      totals: {
        plays: sum(tracks, 'plays'),
        likes: sum(tracks, 'likes'),
        reposts: sum(tracks, 'reposts'),
        comments: sum(tracks, 'comments'),
      },
      playsDelta: {
        week: tracks.reduce((total, track) => total + track.playsDelta.week, 0),
        month: tracks.reduce((total, track) => total + track.playsDelta.month, 0),
      },
      history: totalHistory(days),
      tracks,
      trackedSince: since?.day ?? null,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      lastError: account.lastError,
    };
  }

  private async save(
    userId: string,
    user: SoundcloudUser,
    tracks: SoundcloudTrackSnapshot[],
  ): Promise<TrackNews[]> {
    const day = toLocalDate(this.today());
    const saved = await this.db
      .select()
      .from(soundcloudTracks)
      .where(eq(soundcloudTracks.userId, userId));
    const bySoundcloudId = new Map(saved.map((row) => [row.soundcloudId, row]));
    const news: TrackNews[] = [];

    await this.db.transaction(async (tx) => {
      await tx
        .update(soundcloudAccounts)
        .set({
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          permalinkUrl: user.permalinkUrl,
          followers: user.followers,
          lastSyncedAt: new Date(),
          lastError: null,
        })
        .where(eq(soundcloudAccounts.userId, userId));
      await tx
        .insert(soundcloudAccountDays)
        .values({ userId, day, followers: user.followers })
        .onConflictDoUpdate({
          target: [soundcloudAccountDays.userId, soundcloudAccountDays.day],
          set: { followers: user.followers },
          // Read every hour: a day that did not change stays untouched, otherwise the row
          // would be sent again by the sync between instances.
          setWhere: sql`${soundcloudAccountDays.followers} <> excluded.followers`,
        });

      // A track that is gone from the profile (deleted) goes with its history. An empty list
      // is more likely SoundCloud's hiccup than every track deleted at once: nothing is removed.
      const kept = tracks.map((track) => track.id);
      if (kept.length > 0) {
        await tx
          .delete(soundcloudTracks)
          .where(
            and(
              eq(soundcloudTracks.userId, userId),
              notInArray(soundcloudTracks.soundcloudId, kept),
            ),
          );
      }

      for (const track of tracks) {
        const { id: soundcloudId, publishedAt, ...fields } = track;
        const values = { ...fields, publishedAt: new Date(publishedAt) };
        const previous = bySoundcloudId.get(soundcloudId);
        // Read every hour: a track that did not change is not written again, otherwise each
        // row would be sent by the sync between instances.
        const row =
          previous && sameTrack(previous, values)
            ? previous
            : (
                await tx
                  .insert(soundcloudTracks)
                  .values({ userId, soundcloudId, ...values })
                  .onConflictDoUpdate({
                    target: [soundcloudTracks.userId, soundcloudTracks.soundcloudId],
                    set: values,
                  })
                  .returning({ id: soundcloudTracks.id })
              )[0];
        const counters = {
          plays: track.plays,
          likes: track.likes,
          reposts: track.reposts,
          comments: track.comments,
        };
        const d = soundcloudTrackDays;
        await tx
          .insert(d)
          .values({ trackId: row.id, day, ...counters })
          .onConflictDoUpdate({
            target: [d.trackId, d.day],
            set: counters,
            setWhere: sql`(${d.plays}, ${d.likes}, ${d.reposts}, ${d.comments})
              IS DISTINCT FROM (excluded.plays, excluded.likes, excluded.reposts, excluded.comments)`,
          });
        if (previous?.notify) {
          const found = trackNews(track, previous, track);
          if (found) {
            news.push(found);
          }
        }
      }
    });
    return news;
  }

  private today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }
}

type TrackValues = Omit<SoundcloudTrackSnapshot, 'id' | 'publishedAt'> & { publishedAt: Date };

function sameTrack(row: SoundcloudTrackRow, values: TrackValues): boolean {
  return (Object.keys(values) as (keyof TrackValues)[]).every((key) =>
    key === 'publishedAt'
      ? row.publishedAt.getTime() === values.publishedAt.getTime()
      : row[key] === values[key],
  );
}

function sum(tracks: SoundcloudTrack[], field: 'plays' | 'likes' | 'reposts' | 'comments') {
  return tracks.reduce((total, track) => total + track[field], 0);
}

/** The counters of all tracks per day. A track without a row that day is not in the sum. */
function totalHistory(days: TrackDay[]) {
  const totals = new Map<string, { day: string; plays: number; likes: number }>();
  for (const { day, plays, likes } of days) {
    const total = totals.get(day) ?? { day, plays: 0, likes: 0 };
    total.plays += plays;
    total.likes += likes;
    totals.set(day, total);
  }
  return [...totals.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function toTrack(row: SoundcloudTrackRow, days: TrackDay[], today: DateParts): SoundcloudTrack {
  const plays = days.map((day) => ({ day: day.day, value: day.plays }));
  return {
    id: row.id,
    title: row.title,
    permalinkUrl: row.permalinkUrl,
    artworkUrl: row.artworkUrl,
    isPrivate: row.isPrivate,
    publishedAt: row.publishedAt.toISOString(),
    durationMs: row.durationMs,
    genre: row.genre,
    plays: row.plays,
    likes: row.likes,
    reposts: row.reposts,
    comments: row.comments,
    downloads: row.downloads,
    notify: row.notify,
    playsDelta: {
      week: growth(plays, row.plays, today, 7),
      month: growth(plays, row.plays, today, 30),
    },
    history: days.map((day) => ({ day: day.day, plays: day.plays, likes: day.likes })),
  };
}
