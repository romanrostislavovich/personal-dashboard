import {
  AiAttachment,
  DEFAULT_DIGEST_TIME,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_VISION_MODEL,
} from '@pd/contracts';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {users} from '../users/users.schema';
import type {UndoData} from './ai-undo';

/**
 * Saved AI connections: several per user, one of them active (see `aiSettings`).
 * The API key is stored separately in SecretsService under `ai.connection.<id>`.
 */
export const aiConnections = pgTable(
  'ai_connections',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    name: text().notNull(),
    provider: text().notNull(),
    baseUrl: text().notNull(),
    model: text().notNull(),
    /** What a million tokens cost, in USD, as the provider's price list says; null — unknown. */
    priceInput: doublePrecision(),
    priceOutput: doublePrecision(),
    /** At most this much a calendar month, in USD (needs the prices); null — no limit. */
    monthlyLimit: doublePrecision(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/**
 * The tokens each connection took a day, by model (one connection reads pictures with another
 * model): what the AI costs, and whether a monthly limit is reached (see AiUsageService).
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    connectionId: uuid()
      .notNull()
      .references(() => aiConnections.id, {onDelete: 'cascade'}),
    /** The user's own day. */
    day: date({mode: 'string'}).notNull(),
    model: text().notNull(),
    promptTokens: integer().notNull().default(0),
    completionTokens: integer().notNull().default(0),
    cachedTokens: integer().notNull().default(0),
    requests: integer().notNull().default(0),
  },
  table => [
    primaryKey({columns: [table.connectionId, table.day, table.model]}),
    index().on(table.userId, table.day),
  ],
);

/** User AI settings: which connection is active, the morning digest, voice recognition. */
export const aiSettings = pgTable('ai_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  // Deleting the active connection leaves none active; the service then picks another.
  activeConnectionId: uuid().references(() => aiConnections.id, {
    onDelete: 'set null',
  }),
  morningDigest: boolean().notNull().default(false),
  /** When the user wants it, `HH:mm` in APP_TIMEZONE. */
  morningDigestTime: text().notNull().default(DEFAULT_DIGEST_TIME),
  /** The last day the digest was handled — so it goes out once a day (see isDigestDue). */
  morningDigestDay: date({mode: 'string'}),
  // null — the first OpenAI connection transcribes voice messages.
  speechConnectionId: uuid().references(() => aiConnections.id, {
    onDelete: 'set null',
  }),
  speechModel: text().notNull().default(DEFAULT_SPEECH_MODEL),
  // null — the first OpenAI connection reads pictures (receipts).
  visionConnectionId: uuid().references(() => aiConnections.id, {
    onDelete: 'set null',
  }),
  visionModel: text().notNull().default(DEFAULT_VISION_MODEL),
  // null — the active connection does the light background work too.
  lightConnectionId: uuid().references(() => aiConnections.id, {
    onDelete: 'set null',
  }),
  // null — the first Ollama connection, else the first OpenAI one, makes the vectors.
  embeddingConnectionId: uuid().references(() => aiConnections.id, {
    onDelete: 'set null',
  }),
  embeddingModel: text().notNull().default(DEFAULT_EMBEDDING_MODEL),
  /** Modules the AI does not see (see AiPreferences.disabledModules). */
  disabledModules: text().array().notNull().default([]),
  /** Opt-in digest sections the user switched on (see DigestSection.optIn). */
  digestOptIns: text().array().notNull().default([]),
  /** Sections with an AI connection of their own (see AiPreferences.moduleConnections). */
  moduleConnections: jsonb()
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  /** Sections with a connection of their own that MCP clients may read anyway. */
  mcpModules: text().array().notNull().default([]),
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
      .references(() => users.id, {onDelete: 'cascade'}),
    sectionId: text().notNull(),
    facts: jsonb().notNull(),
    sentAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [primaryKey({columns: [table.userId, table.sectionId]})],
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
      .references(() => users.id, {onDelete: 'cascade'}),
    title: text(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.updatedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => aiConversations.id, {onDelete: 'cascade'}),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    role: text().$type<'user' | 'assistant'>().notNull(),
    content: text().notNull(),
    /** Files sent with the message, with their text: a follow-up ("add them") needs it. */
    attachments: jsonb().$type<AiAttachment[]>().notNull().default([]),
    toolsUsed: text().array().notNull().default([]),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [
    index().on(table.conversationId, table.createdAt),
    index().on(table.userId),
  ],
);

/** Changes the assistant made or tried to make (see AiActionsService). */
export const aiActions = pgTable(
  'ai_actions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    tool: text().notNull(),
    module: text().notNull(),
    args: text().notNull(),
    /** `done`, `asked` (a confirmation), `failed`, `undone`. */
    outcome: text().notNull(),
    error: text(),
    /** The way back of a `done` change (see ai-undo.ts); null — nothing to undo. */
    undo: jsonb().$type<UndoData>(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.createdAt)],
);

/** Facts the assistant keeps between conversations, because the user told it to. */
export const aiMemories = pgTable(
  'ai_memories',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    text: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

export type AiConnectionRow = typeof aiConnections.$inferSelect;
export type AiConversationRow = typeof aiConversations.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;
