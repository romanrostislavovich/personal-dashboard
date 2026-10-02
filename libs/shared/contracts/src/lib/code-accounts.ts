import { z } from 'zod';
import {
  GithubContributionDay,
  GithubFollowersPoint,
  GithubLanguageShare,
  GithubTopRepo,
  GithubYearTotals,
} from './github-profile';
import { REPO_PROVIDERS, RepoProvider } from './open-source';

/** Code hosting services whose accounts the Development section shows. */
export const CODE_PROVIDERS = REPO_PROVIDERS;
export type CodeProvider = RepoProvider;
export const codeProviderSchema = z.enum(CODE_PROVIDERS);

/** The services connected with their own token here (GitHub keeps its older endpoints). */
export const TOKEN_PROVIDERS = ['gitlab', 'bitbucket'] as const;
export type TokenProvider = (typeof TOKEN_PROVIDERS)[number];
export const tokenProviderSchema = z.enum(TOKEN_PROVIDERS);

/**
 * An account on a code hosting service, in one shape for all of them. What a service does not
 * have is `null`: Bitbucket has neither followers nor stars.
 */
export interface CodeAccount {
  provider: CodeProvider;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
  /** When the account was created (ISO). */
  joinedAt: string;
  followers: number | null;
  following: number | null;
  /** The user's own repositories, forks left out. */
  repos: number;
  totalStars: number | null;

  /** Contributions over all saved years. */
  totalContributions: number;
  today: number;
  /** The last 7 days, today included. */
  week: number;
  streak: { current: number; longest: number };
  busiestDay: GithubContributionDay | null;

  /** Newest first. */
  years: GithubYearTotals[];
  languages: GithubLanguageShare[];
  topRepos: GithubTopRepo[];
  followersHistory: GithubFollowersPoint[];

  lastSyncedAt: string | null;
  syncError: string | null;
}

/** One service inside the summary. */
export interface CodeAccountBrief {
  provider: CodeProvider;
  login: string;
  htmlUrl: string;
  totalContributions: number;
  today: number;
  week: number;
  streak: { current: number; longest: number };
  lastSyncedAt: string | null;
  syncError: string | null;
}

/** A year across the services: the totals and how much each service gave. */
export interface CodeSummaryYear extends Omit<GithubYearTotals, 'restricted'> {
  byProvider: Partial<Record<CodeProvider, number>>;
}

/**
 * All connected accounts as one: a day counts what was done on every service, so the streak
 * lives as long as there is a contribution anywhere.
 */
export interface CodeAccountsSummary {
  accounts: CodeAccountBrief[];
  totalContributions: number;
  today: number;
  week: number;
  streak: { current: number; longest: number };
  busiestDay: GithubContributionDay | null;
  /** Newest first. */
  years: CodeSummaryYear[];
}

/** Which services have a token. */
export type CodeAccountsSettings = Record<CodeProvider, boolean>;

export const gitlabTokenInputSchema = z.object({
  token: z.string().trim().min(10),
});
export type GitlabTokenInput = z.infer<typeof gitlabTokenInputSchema>;

/** Bitbucket signs in with the Atlassian account's e-mail and an API token. */
export const bitbucketTokenInputSchema = z.object({
  email: z.string().trim().email(),
  token: z.string().trim().min(10),
});
export type BitbucketTokenInput = z.infer<typeof bitbucketTokenInputSchema>;
