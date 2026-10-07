import { RepoProvider, RepoRelation } from '@pd/contracts';

/** A repository as its service sees it now. */
export interface RepoSnapshot {
  /** The service's own id: stays the same when the repository is renamed or moved. */
  externalId: string;
  /** `owner/name` (on GitLab a group path of any depth) */
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  isFork: boolean;
  isArchived: boolean;
  /** Not public on its service. */
  isPrivate: boolean;
  /** Bitbucket has no stars: its watchers are counted instead. */
  stars: number;
  forks: number;
  openIssues: number;
  openPulls: number;
  pushedAt: string | null;
  latestRelease: { tag: string; publishedAt: string; htmlUrl: string } | null;
  /** The `name` of package.json in the root, unless the package is private. */
  packageName: string | null;
}

export interface AccountRepo extends RepoSnapshot {
  relation: Extract<RepoRelation, 'owner' | 'organization'>;
}

/** A new issue or pull / merge request of a repository — for notifications. */
export interface RepoIssue {
  title: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  isPullRequest: boolean;
}

/** What the Open Source section needs from a service; one implementation per service. */
export interface RepoSource {
  readonly provider: RepoProvider;
  /**
   * Every repository of the token's owner and of their organizations / groups — the private
   * ones too, as far as the token may read them.
   */
  listAccount(): Promise<AccountRepo[]>;
  /** Repositories by name, in the order asked; `null` — not found (deleted, private, a typo). */
  getMany(fullNames: string[]): Promise<(RepoSnapshot | null)[]>;
  /** Issues and pull / merge requests created after `since`. */
  listCreatedSince(fullName: string, since: Date): Promise<RepoIssue[]>;
}
