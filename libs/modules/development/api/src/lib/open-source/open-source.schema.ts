import { users } from '@pd/api-core/schema';
import {
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** Tracked repositories and their current figures (updated by the sync). */
export const trackedRepos = pgTable(
  'github_tracked_repos',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Canonical name from the GitHub API: `owner/name`. */
    fullName: text().notNull(),
    npmPackage: text(),

    htmlUrl: text().notNull(),
    description: text(),
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
  (table) => [unique().on(table.userId, table.fullName)],
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
