import { AiAttachment, DEFAULT_SPEECH_MODEL } from '@pd/contracts';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * Saved AI connections: several per user, one of them active (see `aiSettings`).
 * The API key is stored separately in SecretsService under `ai.connection.<id>`.
 */
export const aiConnections = pgTable('ai_connections', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  provider: text().notNull(),
  baseUrl: text().notNull(),
  model: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** User AI settings: which connection is active, the morning digest, voice recognition. */
export const aiSettings = pgTable('ai_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Deleting the active connection leaves none active; the service then picks another.
  activeConnectionId: uuid().references(() => aiConnections.id, { onDelete: 'set null' }),
  morningDigest: boolean().notNull().default(false),
  // null — the first OpenAI connection transcribes voice messages.
  speechConnectionId: uuid().references(() => aiConnections.id, { onDelete: 'set null' }),
  speechModel: text().notNull().default(DEFAULT_SPEECH_MODEL),
});

/**
 * The facts of each morning digest section as last sent: the next digest tells only what
 * differs from them (see `digestChanges`).
 */
export const morningDigestSnapshots = pgTable(
  'morning_digest_snapshots',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sectionId: text().notNull(),
    facts: jsonb().notNull(),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.sectionId] })],
);

/**
 * Conversations with the assistant, shared by the web chat and Telegram. The current one is
 * the one updated last; "new conversation" (`/new` in Telegram) starts another.
 */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.userId, table.updatedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text().$type<'user' | 'assistant'>().notNull(),
    content: text().notNull(),
    /** Files sent with the message, with their text: a follow-up ("add them") needs it. */
    attachments: jsonb().$type<AiAttachment[]>().notNull().default([]),
    toolsUsed: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.conversationId, table.createdAt)],
);

export type AiConnectionRow = typeof aiConnections.$inferSelect;
export type AiConversationRow = typeof aiConversations.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;
