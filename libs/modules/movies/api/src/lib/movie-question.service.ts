import {Inject, Injectable} from '@nestjs/common';
import {
  BotActionReply,
  DB,
  Database,
  NotificationAction,
  NotificationsService,
  UserRow,
  UsersService,
} from '@pd/api-core';
import {and, eq, isNotNull, isNull, sql} from 'drizzle-orm';
import {movieTitles, movieViews} from './movies.schema';
import {moviesMessages} from './movies.messages';

/** The Telegram buttons: `mv:r:<title id>:<1–10>` rates, `mv:x:<title id>` — not finished. */
export const MOVIE_ACTION = 'mv';
/** The question comes this long after the last view of a film that counts as seen. */
const AFTER_MS = 60 * 60 * 1000;
/** A film seen longer ago is not asked about (the history imported, a server that was down). */
const AT_MOST_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * "How was the film?" (the owner's choices, 2026-10-26): an hour after a film's views made it
 * seen, Telegram and the phone ask for a rating 1–10 — two rows of buttons and "Did not finish".
 * The rating goes to the film; a few words after it (typed or a voice message) become its note.
 * Films only, not shows; one question a film; the quiet hours hold it till the morning.
 */
@Injectable()
export class MovieQuestionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  /** The films due for the question, of every user; each is claimed once. */
  async askDue(now = new Date()): Promise<void> {
    const t = movieTitles;
    const lastView = sql<Date>`(select max(${movieViews.endedAt}) from ${movieViews}
      where ${movieViews.titleId} = ${t.id} and not ${movieViews.dismissed})`;
    const due = await this.db
      .select({id: t.id, userId: t.userId, title: t.title})
      .from(t)
      .where(
        and(
          eq(t.kind, 'movie'),
          isNotNull(t.watchedOn),
          isNull(t.rating),
          isNull(t.askedAt),
          sql`${lastView} <= ${new Date(now.getTime() - AFTER_MS)}`,
          sql`${lastView} > ${new Date(now.getTime() - AT_MOST_MS)}`,
        ),
      );
    for (const film of due) {
      // Taken by this run only: another run (or instance) at the same minute gets nothing.
      const [claimed] = await this.db
        .update(t)
        .set({askedAt: now})
        .where(and(eq(t.id, film.id), isNull(t.askedAt)))
        .returning({id: t.id});
      if (!claimed) {
        continue;
      }
      const user = await this.users.findById(film.userId);
      const text = moviesMessages(user?.locale);
      await this.notifications.send(film.userId, {
        title: text.question(film.title),
        body: text.body,
        source: 'movies',
        actions: buttons(film.id, text.notFinished),
      });
    }
  }

  /** A button under the question: a rating, or "did not finish". */
  async answer(user: UserRow, payload: string): Promise<BotActionReply> {
    const text = moviesMessages(user.locale);
    const [what, id, value] = payload.split(':');
    const owned = and(
      eq(movieTitles.id, id ?? ''),
      eq(movieTitles.userId, user.id),
    );
    if (what === 'x') {
      const [row] = await this.db
        .update(movieTitles)
        .set({watchedOn: null, updatedAt: new Date()})
        .where(owned)
        .returning({id: movieTitles.id});
      return row ? text.unfinished : text.gone;
    }
    const rating = Number(value);
    if (
      what !== 'r' ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 10
    ) {
      return text.gone;
    }
    const [row] = await this.db
      .update(movieTitles)
      .set({rating, updatedAt: new Date()})
      .where(owned)
      .returning({id: movieTitles.id, note: movieTitles.note});
    if (!row) {
      return text.gone;
    }
    return {
      reply: text.rated(rating),
      expectText: async (answerer, words) => {
        const note = words.trim().slice(0, 2000);
        if (!note) {
          return text.noted;
        }
        await this.db
          .update(movieTitles)
          .set({
            note: row.note ? `${row.note}\n${note}` : note,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(movieTitles.id, row.id),
              eq(movieTitles.userId, answerer.id),
            ),
          );
        return text.noted;
      },
    };
  }
}

/** 1–5 and 6–10 as two rows, then "Did not finish" on a row of its own. */
export function buttons(
  titleId: string,
  notFinished: string,
): NotificationAction[] {
  const rate = (n: number): NotificationAction => ({
    label: String(n),
    action: `${MOVIE_ACTION}:r:${titleId}:${n}`,
    ...(n === 1 || n === 6 ? {newRow: true} : {}),
  });
  return [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(rate),
    {label: notFinished, action: `${MOVIE_ACTION}:x:${titleId}`, newRow: true},
  ];
}
