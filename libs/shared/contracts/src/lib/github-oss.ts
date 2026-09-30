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

export const trackedRepoInputSchema = z.object({
  /** `owner/name` or a link https://github.com/owner/name. */
  repo: z
    .string()
    .trim()
    .transform((value) => value.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, ''))
    .pipe(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Expected owner/name')),
  /** The npm package of this repository — for download statistics. */
  npmPackage: z
    .string()
    .transform(npmPackageName)
    .pipe(z.string().min(1).max(214).regex(NPM_NAME, 'Expected an npm package name'))
    .nullish(),
});
export type TrackedRepoInput = z.input<typeof trackedRepoInputSchema>;

export const githubTokenInputSchema = z.object({
  token: z.string().trim().min(10),
});
export type GithubTokenInput = z.infer<typeof githubTokenInputSchema>;

export interface GithubSettings {
  /** The token is set. Without it the public API is used, limited to 60 requests per hour. */
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
  /** `owner/name` */
  fullName: string;
  htmlUrl: string;
  description: string | null;
  npmPackage: string | null;
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
