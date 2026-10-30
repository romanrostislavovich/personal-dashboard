import type {
  InboxAnswerChannel,
  NotificationDeliveryStatus,
} from '@pd/contracts';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  encryptedText,
  registerEncryptedTables,
} from '../crypto/encrypted-columns';
import {users} from '../users/users.schema';
import type {NotificationAction} from './notification-channel';

/** The message a notification became in Telegram: its buttons go once it is answered elsewhere. */
export interface TelegramMessageRef {
  chatId: string;
  messageId: number;
}

/**
 * Every notification sent, kept for 90 days — the bell's inbox as well as the delivery's outbox:
 * a channel that failed (Telegram down, a 429) is tried again by a job with a backoff, the same
 * notification within its window goes out once (see NotificationsService), and the user's read and
 * answer are kept on it (NotificationInboxService). The text is kept encrypted — it may be a
 * medication reminder.
 */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    source: text().notNull(),
    title: encryptedText().notNull(),
    body: encryptedText().notNull(),
    actions: jsonb().$type<NotificationAction[]>().notNull().default([]),
    /** The page a tap opens (see `linkOf`); `null` — the page of its section. */
    link: text(),
    /** A keyed hash of the dedupe key, or of the text when the sender gave none. */
    dedupeKey: text().notNull(),
    status: text().$type<NotificationDeliveryStatus>().notNull(),
    /** The channels it is still to reach (the ones that keep a message: Telegram). */
    channels: text().array().notNull().default([]),
    attempts: integer().notNull().default(0),
    /** The next try of a pending one; of one being sent — when it counts as stuck. */
    nextAttemptAt: timestamp({withTimezone: true}),
    lastError: text(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    sentAt: timestamp({withTimezone: true}),
    /** Seen in the bell (or answered). */
    readAt: timestamp({withTimezone: true}),
    answeredAt: timestamp({withTimezone: true}),
    /** The button pressed, and the words written after it. */
    answer: encryptedText(),
    answeredVia: text().$type<InboxAnswerChannel>(),
    telegramMessage: jsonb().$type<TelegramMessageRef>(),
  },
  table => [
    index().on(table.userId, table.createdAt),
    index().on(table.userId, table.dedupeKey, table.createdAt),
    index().on(table.status, table.nextAttemptAt),
  ],
);

registerEncryptedTables(notificationOutbox);

export type NotificationOutboxRow = typeof notificationOutbox.$inferSelect;
