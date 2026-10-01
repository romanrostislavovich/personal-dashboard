import { users } from '@pd/api-core/schema';
import { GithubLanguageShare, GithubTopRepo } from '@pd/contracts';
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

/** The GitHub account of the token's owner: current figures, updated by the sync. */
export const githubProfiles = pgTable('github_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  login: text().notNull(),
  name: text(),
  avatarUrl: text().notNull(),
  htmlUrl: text().notNull(),
  joinedAt: timestamp({ withTimezone: true }).notNull(),
  followers: integer().notNull(),
  following: integer().notNull(),
  /** The user's own repositories, forks left out. */
  repos: integer().notNull(),
  totalStars: integer().notNull(),
  languages: jsonb().$type<GithubLanguageShare[]>().notNull(),
  topRepos: jsonb().$type<GithubTopRepo[]>().notNull(),
  lastSyncedAt: timestamp({ withTimezone: true }),
  syncError: text(),
});

/** The contribution calendar: one row per day since the account was created, zeros included. */
export const githubContributionDays = pgTable(
  'github_contribution_days',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    count: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

/** What a year's contributions were made of. */
export const githubContributionYears = pgTable(
  'github_contribution_years',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    year: integer().notNull(),
    contributions: integer().notNull(),
    commits: integer().notNull(),
    pullRequests: integer().notNull(),
    reviews: integer().notNull(),
    issues: integer().notNull(),
    /** Contributions to private repositories the token cannot see into. */
    restricted: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.year] })],
);

/** Daily history of the account: one row per day (the last value of the day). */
export const githubProfileDailyStats = pgTable(
  'github_profile_daily_stats',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    followers: integer().notNull(),
    repos: integer().notNull(),
    totalStars: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

export type GithubProfileRow = typeof githubProfiles.$inferSelect;
