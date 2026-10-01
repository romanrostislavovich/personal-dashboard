import { z } from 'zod';
import { LocalDate } from './local-date';

/** Contributions of one day, as on the GitHub profile calendar. */
export interface GithubContributionDay {
  day: LocalDate;
  count: number;
}

/** A year of the account. */
export interface GithubYearTotals {
  year: number;
  contributions: number;
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  /** Contributions to private repositories the token cannot see into. */
  restricted: number;
}

/** A language across the user's own repositories, by the bytes of code. */
export interface GithubLanguageShare {
  name: string;
  /** GitHub's colour of the language (`#3178c6`). */
  color: string | null;
  bytes: number;
}

export interface GithubTopRepo {
  /** `owner/name` */
  fullName: string;
  htmlUrl: string;
  stars: number;
  forks: number;
  language: string | null;
  isPrivate: boolean;
}

export interface GithubFollowersPoint {
  day: LocalDate;
  followers: number;
}

/** Statistics of the GitHub account the token belongs to. */
export interface GithubProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  /** When the account was created (ISO). */
  joinedAt: string;
  followers: number;
  following: number;
  /** The user's own repositories, forks left out. */
  repos: number;
  /** Stars across them. */
  totalStars: number;

  /** Contributions over all years. */
  totalContributions: number;
  today: number;
  /** The last 7 days, today included. */
  week: number;
  /** Days in a row with a contribution; today without one does not break the current streak. */
  streak: { current: number; longest: number };
  busiestDay: GithubContributionDay | null;

  /** Newest first. */
  years: GithubYearTotals[];
  languages: GithubLanguageShare[];
  topRepos: GithubTopRepo[];
  /** Saved once a day since the token was added. */
  followersHistory: GithubFollowersPoint[];

  lastSyncedAt: string | null;
  /** Text of the last sync error (for example, the token lacks a permission). */
  syncError: string | null;
}

/** GitHub opened in 2008. */
export const githubYearSchema = z.coerce.number().int().min(2008).max(2100);
