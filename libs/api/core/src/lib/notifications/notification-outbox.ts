import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_DELIVERY_STATUSES,
  NotificationDeliveryStatus,
  NotificationLog,
} from '@pd/contracts';
import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { keyedHash } from '../crypto/encrypted-columns';
import { Notification } from './notification-channel';
import {
  NotificationOutboxRow,
  notificationOutbox,
  TelegramMessageRef,
} from './notifications.schema';

/** A notification with the same text is not sent again within this time (a job run twice). */
const SAME_TEXT_MINUTES = 5;
/** How long a send may take before the row counts as stuck (the process died in the middle). */
const SENDING_LEASE_MS = 15 * 60 * 1000;
/** The waits after the 1st, 2nd… failed try; after the last one it is given up. */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
/** How many are picked up by one run of the retry job. */
const BATCH = 50;
/** The log — and the bell's inbox — keep 90 days. */
const KEEP_DAYS = 90;

/**
 * The table of notifications (see `notificationOutbox`): what is due again, what went out the
 * same a moment ago, and the log. Delivery itself is NotificationsService's.
 */
@Injectable()
export class NotificationOutbox {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Writes a notification down, unless the same one went out within its window — then it is
   * written as `deduplicated` and `null` is returned. One user's check and write go one at a
   * time, so two jobs sending the same at once do not both pass.
   */
  async add(
    userId: string,
    notification: Notification,
    channels: string[],
    status: 'sending' | 'sent' | 'failed' | 'held',
    lastError: string | null = null,
    /** For `held`: the end of the quiet hours, when it goes out. */
    heldUntil: Date | null = null,
  ): Promise<NotificationOutboxRow | null> {
    const { title, body, source, actions = [], dedupe, link } = notification;
    const dedupeKey = keyedHash(dedupe?.key ?? `${source}\n${title}\n${body}`);
    const since = new Date(Date.now() - (dedupe?.minutes ?? SAME_TEXT_MINUTES) * 60_000);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`outbox:${userId}`}))`);
      const [seen] = await tx
        .select({ id: notificationOutbox.id })
        .from(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.userId, userId),
            eq(notificationOutbox.dedupeKey, dedupeKey),
            gte(notificationOutbox.createdAt, since),
            ne(notificationOutbox.status, 'deduplicated'),
          ),
        )
        .limit(1);
      const [row] = await tx
        .insert(notificationOutbox)
        .values({
          userId,
          source,
          title,
          body,
          actions,
          link: link ?? null,
          dedupeKey,
          status: seen ? 'deduplicated' : status,
          channels: seen ? [] : channels,
          lastError,
          nextAttemptAt:
            status === 'sending'
              ? new Date(Date.now() + SENDING_LEASE_MS)
              : status === 'held'
                ? heldUntil
                : null,
          sentAt: status === 'sent' && !seen ? new Date() : null,
        })
        .returning();
      return seen ? null : row;
    });
  }

  /**
   * The pending ones whose time has come, and the ones stuck in sending: taken as `sending`
   * so that a second run of the job does not take them too.
   */
  async claimDue(now = new Date()): Promise<NotificationOutboxRow[]> {
    const lease = new Date(now.getTime() + SENDING_LEASE_MS);
    const { rows } = await this.db.execute<{ id: string }>(sql`
      UPDATE ${notificationOutbox} SET status = 'sending', next_attempt_at = ${lease}
      WHERE id IN (
        SELECT id FROM ${notificationOutbox}
        WHERE status IN ('pending', 'sending') AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`);
    if (!rows.length) {
      return [];
    }
    // Read through Drizzle: the text columns are decrypted on the way.
    return this.db
      .select()
      .from(notificationOutbox)
      .where(
        sql`${notificationOutbox.id} IN (${sql.join(
          rows.map((row) => sql`${row.id}`),
          sql`, `,
        )})`,
      );
  }

  /**
   * The ones held through the quiet hours that have ended: taken as `sending`, like `claimDue`,
   * and handed back together so a user's night goes out as one message.
   */
  async claimHeld(now = new Date()): Promise<NotificationOutboxRow[]> {
    const lease = new Date(now.getTime() + SENDING_LEASE_MS);
    const { rows } = await this.db.execute<{ id: string }>(sql`
      UPDATE ${notificationOutbox} SET status = 'sending', next_attempt_at = ${lease}
      WHERE id IN (
        SELECT id FROM ${notificationOutbox}
        WHERE status = 'held' AND next_attempt_at <= ${now}
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`);
    if (!rows.length) {
      return [];
    }
    return this.db
      .select()
      .from(notificationOutbox)
      .where(
        sql`${notificationOutbox.id} IN (${sql.join(
          rows.map((row) => sql`${row.id}`),
          sql`, `,
        )})`,
      )
      .orderBy(notificationOutbox.createdAt);
  }

  /** The Telegram message a question became: its buttons go once it is answered elsewhere. */
  async setTelegramMessage(id: string, message: TelegramMessageRef): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({ telegramMessage: message })
      .where(eq(notificationOutbox.id, id));
  }

  /** Every channel took it. */
  async delivered(id: string): Promise<void> {
    await this.db
      .update(notificationOutbox)
      .set({ status: 'sent', channels: [], nextAttemptAt: null, sentAt: new Date() })
      .where(eq(notificationOutbox.id, id));
  }

  /**
   * Some channels failed: tried again after the backoff (or as long as the service asked to
   * wait), or given up — after the last try, or when trying again cannot help.
   */
  async failed(
    row: NotificationOutboxRow,
    remaining: string[],
    error: string,
    { retryAfterMs = 0, permanent = false }: { retryAfterMs?: number; permanent?: boolean },
  ): Promise<void> {
    const attempts = row.attempts + 1;
    const wait = BACKOFF_MS[attempts - 1];
    const giveUp = permanent || wait === undefined;
    await this.db
      .update(notificationOutbox)
      .set({
        status: giveUp ? 'failed' : 'pending',
        channels: remaining,
        attempts,
        lastError: error.slice(0, 500),
        nextAttemptAt: giveUp ? null : new Date(Date.now() + Math.max(wait, retryAfterMs)),
      })
      .where(eq(notificationOutbox.id, row.id));
  }

  /** The latest notifications of the user, and how many of each status in the last week. */
  async log(userId: string, limit = 100): Promise<NotificationLog> {
    const rows = await this.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.userId, userId))
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(limit);
    const counts = await this.db
      .select({ status: notificationOutbox.status, count: sql<number>`count(*)::int` })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.userId, userId),
          gte(notificationOutbox.createdAt, new Date(Date.now() - 7 * 86_400_000)),
        ),
      )
      .groupBy(notificationOutbox.status);
    const week = Object.fromEntries(
      NOTIFICATION_DELIVERY_STATUSES.map((status) => [status, 0]),
    ) as Record<NotificationDeliveryStatus, number>;
    counts.forEach(({ status, count }) => (week[status] = count));
    return {
      items: rows.map((row) => ({
        id: row.id,
        source: row.source,
        title: row.title,
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        nextAttemptAt: row.status === 'pending' ? (row.nextAttemptAt?.toISOString() ?? null) : null,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
      })),
      week,
    };
  }

  /** Drops what is older than 90 days. */
  async prune(now = new Date()): Promise<void> {
    await this.db
      .delete(notificationOutbox)
      .where(lt(notificationOutbox.createdAt, new Date(now.getTime() - KEEP_DAYS * 86_400_000)));
  }
}
