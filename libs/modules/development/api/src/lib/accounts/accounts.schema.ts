import { users } from '@pd/api-core/schema';
import { GithubLanguageShare, GithubTopRepo, TokenProvider } from '@pd/contracts';
import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The user's account on GitLab or Bitbucket: current figures, updated by the sync. (The GitHub
 * account has tables of its own, see github-profile.schema.ts.)
 */
export const codeAccounts = pgTable(
  'code_accounts',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text().$type<TokenProvider>().notNull(),
    login: text().notNull(),
    name: text(),
    avatarUrl: text(),
    htmlUrl: text().notNull(),
    joinedAt: timestamp({ withTimezone: true }).notNull(),
    /** `null` — the service has no such thing (Bitbucket: followers and stars). */
    followers: integer(),
    following: integer(),
    /** The user's own repositories, forks left out. */
    repos: integer().notNull(),
    totalStars: integer(),
    languages: jsonb().$type<GithubLanguageShare[]>().notNull(),
    topRepos: jsonb().$type<GithubTopRepo[]>().notNull(),
    lastSyncedAt: timestamp({ withTimezone: true }),
    syncError: text(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

/**
 * The activity calendar, built here from the service's events: one row per day with something
 * done. The parts are kept per day, so the totals of a year are their sums.
 */
export const codeAccountDays = pgTable(
  'code_account_days',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text().$type<TokenProvider>().notNull(),
    day: date({ mode: 'string' }).notNull(),
    /** Contributions of the day, as the calendar shows them. */
    count: integer().notNull(),
    commits: integer().notNull().default(0),
    pullRequests: integer().notNull().default(0),
    reviews: integer().notNull().default(0),
    issues: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider, table.day] })],
);

export type CodeAccountRow = typeof codeAccounts.$inferSelect;
