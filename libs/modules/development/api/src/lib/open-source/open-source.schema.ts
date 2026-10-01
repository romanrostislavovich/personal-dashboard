import { users } from '@pd/api-core/schema';
import { RepoProvider, RepoRelation } from '@pd/contracts';
import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Repositories of the Open Source section and their current figures (updated by the sync):
 * the public ones the integration brings and the ones added by hand.
 */
export const trackedRepos = pgTable(
  'github_tracked_repos',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text().$type<RepoProvider>().notNull().default('github'),
    /** How it got here: the account's own, an organization's, or added by hand. */
    relation: text().$type<RepoRelation>().notNull().default('manual'),
    /** The provider's own id: a renamed repository stays the same row and keeps its history. */
    externalId: text(),
    /** Canonical name from the provider: `owner/name`. */
    fullName: text().notNull(),
    hidden: boolean().notNull().default(false),
    /** Tell about new issues, PRs, releases and star milestones. */
    notify: boolean().notNull().default(false),
    npmPackage: text(),
    /** Set by hand: the sync does not replace it with the one from package.json. */
    npmPackageManual: boolean().notNull().default(false),

    htmlUrl: text().notNull(),
    description: text(),
    language: text(),
    isFork: boolean().notNull().default(false),
    isArchived: boolean().notNull().default(false),
    stars: integer().notNull().default(0),
    forks: integer().notNull().default(0),
    openIssues: integer().notNull().default(0),
    openPulls: integer().notNull().default(0),
    npmWeeklyDownloads: integer(),
    latestReleaseTag: text(),
    latestReleaseAt: timestamp({ withTimezone: true }),
    pushedAt: timestamp({ withTimezone: true }),

    lastSyncedAt: timestamp({ withTimezone: true }),
    syncError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.provider, table.fullName)],
);

/** Daily history: one row per repository per day (the last value of the day). */
export const repoDailyStats = pgTable(
  'github_repo_daily_stats',
  {
    repoId: uuid()
      .notNull()
      .references(() => trackedRepos.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    stars: integer().notNull(),
    forks: integer().notNull(),
    openIssues: integer().notNull(),
    openPulls: integer().notNull(),
    npmWeeklyDownloads: integer(),
  },
  (table) => [primaryKey({ columns: [table.repoId, table.day] })],
);

export type TrackedRepoRow = typeof trackedRepos.$inferSelect;
export type RepoDailyStatsRow = typeof repoDailyStats.$inferSelect;
