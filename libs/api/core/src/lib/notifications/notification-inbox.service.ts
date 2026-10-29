import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  InboxAnswerChannel,
  InboxAnswerInput,
  InboxAnswerResult,
  InboxItem,
  InboxQueryParsed,
  InboxSummary,
} from '@pd/contracts';
import { and, desc, eq, gt, isNull, lt, ne, sql, SQL } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { coreMessages } from '../i18n/core.messages';
import { RealtimeService } from '../realtime/realtime.service';
import { UserRow } from '../users/users.schema';
import { UsersService } from '../users/users.service';
import { ActionResult, NotificationActions } from './notification-actions';
import { linkOf } from './notification-link';
import {
  NotificationOutboxRow,
  notificationOutbox,
  TelegramMessageRef,
} from './notifications.schema';
import { PushService } from './push/push.service';
import { TelegramBotService } from './telegram/telegram-bot.service';

/** A question unanswered for longer no longer waits: the day it asked about has passed. */
export const QUESTION_WAITS_DAYS = 3;
const DAY_MS = 86_400_000;

/**
 * The bell: every notification that went to Telegram or the phone (the rows of the outbox), on
 * every device the same — read or not, and a question's answer wherever it was given.
 *
 * A question is answered once: the first press — in the bell, in Telegram, on the phone — takes
 * it, runs its handler (NotificationActions) and closes it everywhere else (Telegram's buttons
 * go, an open bell is told).
 */
@Injectable()
export class NotificationInboxService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly actions: NotificationActions,
    private readonly telegram: TelegramBotService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    this.telegram.useAnswers({
      button: (user, message, action) => this.answerTelegramButton(user, message, action),
      text: (user, text) =>
        this.answerWords(user, text, 'telegram').then((done) => done?.reply ?? null),
    });
  }

  async list(userId: string, query: InboxQueryParsed, now = new Date()): Promise<InboxItem[]> {
    const conditions: SQL[] = [this.mine(userId)];
    if (query.filter === 'questions') {
      conditions.push(this.waiting(now));
    }
    if (query.before) {
      conditions.push(lt(notificationOutbox.createdAt, new Date(query.before)));
    }
    const rows = await this.db
      .select()
      .from(notificationOutbox)
      .where(and(...conditions))
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(query.limit);
    return rows.map((row) => toItem(row, now));
  }

  async summary(userId: string, now = new Date()): Promise<InboxSummary> {
    const [counts] = await this.db
      .select({
        unread: sql<number>`count(*) FILTER (WHERE ${notificationOutbox.readAt} IS NULL)::int`,
        waiting: sql<number>`count(*) FILTER (WHERE ${this.waiting(now)})::int`,
      })
      .from(notificationOutbox)
      .where(this.mine(userId));
    return { unread: counts?.unread ?? 0, waiting: counts?.waiting ?? 0 };
  }

  /** One notification, and whether the words its answer asked for are awaited now. */
  async get(userId: string, id: string, now = new Date()): Promise<InboxItem> {
    return {
      ...toItem(await this.row(userId, id), now),
      awaitsWords: this.actions.awaitsText(userId, id),
    };
  }

  /**
   * A press in the phone's shade, without a session: the token the notification carried fits it
   * alone (`pushAnswerToken`), and only its own buttons are taken.
   */
  async answerFromPush(id: string, action: string): Promise<InboxAnswerResult> {
    const [row] = await this.db
      .select({ userId: notificationOutbox.userId })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.id, id));
    if (!row) {
      throw new NotFoundException();
    }
    return this.answer(row.userId, id, { action }, 'push');
  }

  /** Seen: one, or all of them ("read all"). */
  async markRead(userId: string, id?: string): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({ readAt: new Date() })
      .where(
        and(
          this.mine(userId),
          isNull(notificationOutbox.readAt),
          ...(id ? [eq(notificationOutbox.id, id)] : []),
        ),
      );
    this.realtime.emit(userId, { type: 'inbox' });
  }

  /** A press of a button, or the words it asked for — from the bell or the phone. */
  async answer(
    userId: string,
    id: string,
    input: InboxAnswerInput,
    via: InboxAnswerChannel,
  ): Promise<InboxAnswerResult> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundException();
    }
    const row = await this.row(userId, id);
    if ('text' in input) {
      const done = await this.answerWords(user, input.text, via, id);
      if (!done) {
        throw new BadRequestException(coreMessages(user.locale).inboxNoWordsAwaited);
      }
      return { reply: done.reply, expectsText: false, item: await this.get(userId, id) };
    }
    const result = await this.press(user, row, input.action, via);
    return { ...result, item: await this.get(userId, id) };
  }

  /**
   * Takes the question for this press (once: a second press, here or anywhere, only hears what
   * was answered), runs its handler, and closes it in the other channels.
   */
  private async press(
    user: UserRow,
    row: NotificationOutboxRow,
    action: string,
    via: InboxAnswerChannel,
  ): Promise<ActionResult> {
    const button = row.actions.find((one) => one.action === action);
    if (!button) {
      throw new BadRequestException('Not a button of this notification');
    }
    const text = coreMessages(user.locale);
    const now = new Date();
    const [taken] = await this.db
      .update(notificationOutbox)
      .set({ answeredAt: now, answer: button.label, answeredVia: via, readAt: row.readAt ?? now })
      .where(and(eq(notificationOutbox.id, row.id), isNull(notificationOutbox.answeredAt)))
      .returning({ id: notificationOutbox.id });
    if (!taken) {
      const [answered] = await this.db
        .select({ answer: notificationOutbox.answer })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, row.id));
      return { reply: text.inboxAlreadyAnswered(answered?.answer ?? ''), expectsText: false };
    }
    let result: ActionResult | null;
    try {
      result = await this.actions.run(user, action, row.id);
    } catch (error) {
      // The section could not take it: the question waits again.
      await this.db
        .update(notificationOutbox)
        .set({ answeredAt: null, answer: null, answeredVia: null })
        .where(eq(notificationOutbox.id, row.id));
      throw error;
    }
    if (!result) {
      await this.db
        .update(notificationOutbox)
        .set({ answeredAt: null, answer: null, answeredVia: null })
        .where(eq(notificationOutbox.id, row.id));
      throw new BadRequestException('No section takes this button');
    }
    if (via !== 'telegram' && row.telegramMessage) {
      await this.telegram.closeMessage(
        row.telegramMessage,
        text.inboxAnsweredElsewhere(button.label),
      );
    }
    // The phone that answered shows the reply on its notification itself.
    if (via !== 'push') {
      await this.push.close(user.id, row.id);
    }
    this.realtime.emit(user.id, { type: 'inbox' });
    return result;
  }

  /** The words a press asked for: handed to its handler and kept with the answer. */
  private async answerWords(
    user: UserRow,
    words: string,
    via: InboxAnswerChannel,
    notificationId?: string,
  ): Promise<{ reply: string } | null> {
    const done = await this.actions.answerText(user, words, notificationId);
    if (!done) {
      return null;
    }
    if (done.notificationId) {
      const [row] = await this.db
        .select({
          answer: notificationOutbox.answer,
          telegramMessage: notificationOutbox.telegramMessage,
        })
        .from(notificationOutbox)
        .where(and(this.mine(user.id), eq(notificationOutbox.id, done.notificationId)));
      if (row) {
        const answer = row.answer ? `${row.answer} · ${words}` : words;
        await this.db
          .update(notificationOutbox)
          .set({ answer })
          .where(eq(notificationOutbox.id, done.notificationId));
        if (via !== 'telegram' && row.telegramMessage) {
          await this.telegram.closeMessage(
            row.telegramMessage,
            coreMessages(user.locale).inboxAnsweredElsewhere(answer),
          );
        }
        this.realtime.emit(user.id, { type: 'inbox' });
      }
    }
    return { reply: done.reply };
  }

  /** A press in Telegram: a notification's button answers it here; `null` — not a notification. */
  private async answerTelegramButton(
    user: UserRow,
    message: TelegramMessageRef,
    action: string,
  ): Promise<ActionResult | null> {
    const [row] = await this.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          this.mine(user.id),
          sql`${notificationOutbox.telegramMessage}->>'chatId' = ${message.chatId}`,
          sql`(${notificationOutbox.telegramMessage}->>'messageId')::int = ${message.messageId}`,
        ),
      )
      .limit(1);
    if (!row || !row.actions.some((one) => one.action === action)) {
      return null;
    }
    return this.press(user, row, action, 'telegram');
  }

  private async row(userId: string, id: string): Promise<NotificationOutboxRow> {
    const [row] = await this.db
      .select()
      .from(notificationOutbox)
      .where(and(this.mine(userId), eq(notificationOutbox.id, id)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }

  /** The user's notifications in the bell: a repeat that was not sent is not one. */
  private mine(userId: string): SQL {
    return and(
      eq(notificationOutbox.userId, userId),
      ne(notificationOutbox.status, 'deduplicated'),
    ) as SQL;
  }

  private waiting(now: Date): SQL {
    return and(
      sql`jsonb_array_length(${notificationOutbox.actions}) > 0`,
      isNull(notificationOutbox.answeredAt),
      gt(notificationOutbox.createdAt, new Date(now.getTime() - QUESTION_WAITS_DAYS * DAY_MS)),
    ) as SQL;
  }
}

export function toItem(row: NotificationOutboxRow, now = new Date()): InboxItem {
  return {
    id: row.id,
    source: row.source,
    title: row.title,
    body: row.body,
    link: linkOf({ source: row.source, link: row.link ?? undefined }),
    actions: row.actions,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    answer: row.answer ?? null,
    answeredVia: row.answeredVia ?? null,
    awaitsWords: false,
    waiting:
      row.actions.length > 0 &&
      !row.answeredAt &&
      row.createdAt.getTime() > now.getTime() - QUESTION_WAITS_DAYS * DAY_MS,
  };
}
