import { REPO_PROVIDERS, RepoProvider, RepoRelation, TrackedRepo } from '@pd/contracts';

/** Kinds of repositories that can be left out of the table. */
export type RepoKind = 'forks' | 'archived' | 'hidden';

export interface RepoFilter {
  /** Part of the name or the description. */
  search: string;
  relation: RepoRelation | null;
  /** GitHub, GitLab or Bitbucket. */
  provider: RepoProvider | null;
  language: string | null;
  /** Kinds that are shown; all of them are off until asked for. */
  kinds: RepoKind[];
}

export const DEFAULT_REPO_FILTER: RepoFilter = {
  search: '',
  relation: null,
  provider: null,
  language: null,
  kinds: [],
};

export type RepoSortColumn =
  | 'fullName'
  | 'language'
  | 'stars'
  | 'starsWeek'
  | 'forks'
  | 'openIssues'
  | 'openPulls'
  | 'npmWeeklyDownloads'
  | 'pushedAt';

export interface RepoSort {
  column: RepoSortColumn;
  descending: boolean;
}

export function filterRepos(repos: TrackedRepo[], filter: RepoFilter): TrackedRepo[] {
  const search = filter.search.trim().toLowerCase();
  return repos.filter(
    (repo) =>
      (filter.kinds.includes('forks') || !repo.isFork) &&
      (filter.kinds.includes('archived') || !repo.isArchived) &&
      (filter.kinds.includes('hidden') || !repo.hidden) &&
      (!filter.relation || repo.relation === filter.relation) &&
      (!filter.provider || repo.provider === filter.provider) &&
      (!filter.language || repo.language === filter.language) &&
      (!search ||
        repo.fullName.toLowerCase().includes(search) ||
        (repo.description ?? '').toLowerCase().includes(search)),
  );
}

/** Empty values (no language, no npm package, never pushed) go last in either direction. */
export function sortRepos(repos: TrackedRepo[], { column, descending }: RepoSort): TrackedRepo[] {
  const value = (repo: TrackedRepo): string | number | null =>
    column === 'starsWeek' ? repo.starsDelta.week : repo[column];
  return [...repos].sort((a, b) => {
    const [left, right] = [value(a), value(b)];
    if (left === null || right === null) {
      return left === right ? 0 : left === null ? 1 : -1;
    }
    const order =
      typeof left === 'string' ? left.localeCompare(String(right)) : left - Number(right);
    return descending ? -order : order;
  });
}

/** Languages of the repositories, for the filter: alphabetical. */
export function repoLanguages(repos: TrackedRepo[]): string[] {
  return [...new Set(repos.flatMap((repo) => (repo.language ? [repo.language] : [])))].sort();
}

/** The services the repositories come from, for the filter: in their usual order. */
export function repoProviders(repos: TrackedRepo[]): RepoProvider[] {
  return REPO_PROVIDERS.filter((provider) => repos.some((repo) => repo.provider === provider));
}
