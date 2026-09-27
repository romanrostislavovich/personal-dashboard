import { z } from 'zod';
import { LocalDate } from './local-date';

export const trackedRepoInputSchema = z.object({
  /** `owner/name` or a link https://github.com/owner/name. */
  repo: z
    .string()
    .trim()
    .transform((value) => value.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, ''))
    .pipe(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Expected owner/name')),
  /** The npm package of this repository — for download statistics. */
  npmPackage: z.string().trim().min(1).max(214).nullish(),
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
