import { z } from 'zod';
import { LocalDate } from './local-date';

/** An npm package name, with its scope if it has one: `ngx-translate-lint`, `@scope/name`. */
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * The package name from what the user pasted: the name itself or its page on npmjs.com
 * (`https://www.npmjs.com/package/@scope/name/v/1.2.0?activeTab=readme` → `@scope/name`).
 */
export function npmPackageName(value: string): string {
  const trimmed = value.trim();
  const page = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?npmjs\.com\/package\/(.+)$/i);
  if (!page) {
    return trimmed;
  }
  const [first, second] = page[1].split(/[?#]/)[0].split('/');
  return decodeURIComponent(first.startsWith('@') && second ? `${first}/${second}` : first);
}

const npmPackageSchema = z
  .string()
  .transform(npmPackageName)
  .pipe(z.string().min(1).max(214).regex(NPM_NAME, 'Expected an npm package name'));

/** Where repositories come from. GitLab and Bitbucket join here later. */
export const REPO_PROVIDERS = ['github'] as const;
export type RepoProvider = (typeof REPO_PROVIDERS)[number];

/**
 * How a repository got into the list: `owner` and `organization` come from the integration
 * (the account's own public repositories and those of its organizations), `manual` is any
 * repository added by hand.
 */
export const REPO_RELATIONS = ['owner', 'organization', 'manual'] as const;
export type RepoRelation = (typeof REPO_RELATIONS)[number];

/** Adding a repository by hand — one the integration does not bring by itself. */
export const trackedRepoInputSchema = z.object({
  /** `owner/name` or a link https://github.com/owner/name. */
  repo: z
    .string()
    .trim()
    .transform((value) => value.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, ''))
    .pipe(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Expected owner/name')),
  /** The npm package of this repository — for download statistics. */
  npmPackage: npmPackageSchema.nullish(),
});
export type TrackedRepoInput = z.input<typeof trackedRepoInputSchema>;

/** `PATCH /api/development/repos/:id`: only the fields sent change. */
export const trackedRepoUpdateSchema = z.object({
  /** Out of the list, the totals, the widget and the digest. */
  hidden: z.boolean().optional(),
  /** Tell about new issues, PRs, releases and star milestones. */
  notify: z.boolean().optional(),
  /** The package set by hand; `null` — the repository has none (the detected one is ignored). */
  npmPackage: npmPackageSchema.nullable().optional(),
});
export type TrackedRepoUpdate = z.input<typeof trackedRepoUpdateSchema>;

export const githubTokenInputSchema = z.object({
  token: z.string().trim().min(10),
});
export type GithubTokenInput = z.infer<typeof githubTokenInputSchema>;

export interface GithubSettings {
  /** The token is set: repositories and the account are read with it. */
  tokenConfigured: boolean;
}

/** A history point: values at the end of the day. */
export interface RepoStatsPoint {
  day: LocalDate;
  stars: number;
  npmWeeklyDownloads: number | null;
}

export interface TrackedRepo {
  id: string;
  provider: RepoProvider;
  relation: RepoRelation;
  /** `owner/name` */
  fullName: string;
  htmlUrl: string;
  description: string | null;
  /** The main language. */
  language: string | null;
  isFork: boolean;
  isArchived: boolean;
  hidden: boolean;
  notify: boolean;
  npmPackage: string | null;
  /** The package was set by hand, not read from the repository's package.json. */
  npmPackageManual: boolean;
  stars: number;
  forks: number;
  openIssues: number;
  openPulls: number;
  npmWeeklyDownloads: number | null;
  latestRelease: { tag: string; publishedAt: string } | null;
  pushedAt: string | null;
  lastSyncedAt: string | null;
  /** Text of the last sync error (for example, the repository was deleted). */
  syncError: string | null;
  /** Star growth over 7 and 30 days (from the saved history). */
  starsDelta: { week: number; month: number };
  /** History for the last 30 days for the chart. */
  history: RepoStatsPoint[];
}
