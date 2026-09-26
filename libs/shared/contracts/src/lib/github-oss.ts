import { z } from 'zod';
import { LocalDate } from './local-date';

export const trackedRepoInputSchema = z.object({
  /** `owner/name` или ссылка https://github.com/owner/name. */
  repo: z
    .string()
    .trim()
    .transform((value) => value.replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, ''))
    .pipe(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'Expected owner/name')),
  /** npm-пакет этого репозитория — для статистики загрузок. */
  npmPackage: z.string().trim().min(1).max(214).nullish(),
});
export type TrackedRepoInput = z.input<typeof trackedRepoInputSchema>;

export const githubTokenInputSchema = z.object({
  token: z.string().trim().min(10),
});
export type GithubTokenInput = z.infer<typeof githubTokenInputSchema>;

export interface GithubSettings {
  /** Токен задан. Без него работает публичный API с лимитом 60 запросов в час. */
  tokenConfigured: boolean;
}

/** Точка истории: значения на конец дня. */
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
  /** Текст последней ошибки синхронизации (например, репозиторий удалён). */
  syncError: string | null;
  /** Прирост звёзд за 7 и 30 дней (по сохранённой истории). */
  starsDelta: { week: number; month: number };
  /** История за последние 30 дней для графика. */
  history: RepoStatsPoint[];
}
