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

/** Where repositories come from. */
export const REPO_PROVIDERS = ['github', 'gitlab', 'bitbucket'] as const;
export type RepoProvider = (typeof REPO_PROVIDERS)[number];

const REPO_HOSTS: Record<string, RepoProvider> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'bitbucket.org': 'bitbucket',
};
/** GitLab projects live in groups of any depth: `group/subgroup/name`. */
const REPO_PATH: Record<RepoProvider, RegExp> = {
  github: /^[\w.-]+\/[\w.-]+$/,
  gitlab: /^[\w.-]+(\/[\w.-]+)+$/,
  bitbucket: /^[\w.-]+\/[\w.-]+$/,
};

/**
 * A repository from what the user pasted: its link on GitHub, GitLab or Bitbucket, or the bare
 * `owner/name` — then the service is `provider` (GitHub unless said otherwise).
 */
export function parseRepoReference(
  value: string,
  provider: RepoProvider = 'github',
): { provider: RepoProvider; repo: string } | null {
  const link = value.trim().match(/^(?:https?:\/\/)?(?:www\.)?([a-z.]+\.[a-z]+)\/(.+)$/i);
  const host = link ? REPO_HOSTS[link[1].toLowerCase()] : undefined;
  if (link && !host) {
    return null;
  }
  const repo = (link ? link[2] : value.trim())
    .split(/[?#]/)[0]
    // GitLab pages of a project go after `/-/`, Bitbucket ones after `/src/`.
    .replace(/\/(-|src)\/.*$/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const found = host ?? provider;
  return REPO_PATH[found].test(repo) ? { provider: found, repo } : null;
}

/**
 * How a repository got into the list: `owner` and `organization` come from the integration
 * (the account's own public repositories and those of its organizations), `manual` is any
 * repository added by hand.
 */
export const REPO_RELATIONS = ['owner', 'organization', 'manual'] as const;
export type RepoRelation = (typeof REPO_RELATIONS)[number];

/** Adding a repository by hand — one the integration does not bring by itself. */
export const trackedRepoInputSchema = z
  .object({
    /** A link to the repository on GitHub, GitLab or Bitbucket, or `owner/name`. */
    repo: z.string().trim().min(1).max(300),
    /** The service of a bare `owner/name`; a link names its service itself. */
    provider: z.enum(REPO_PROVIDERS).optional(),
    /** The npm package of this repository — for download statistics. */
    npmPackage: npmPackageSchema.nullish(),
  })
  .transform((input, context) => {
    const reference = parseRepoReference(input.repo, input.provider);
    if (!reference) {
      context.addIssue({ code: 'custom', path: ['repo'], message: 'Expected owner/name' });
      return z.NEVER;
    }
    return { ...input, ...reference };
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
