import { GithubLanguageShare, GithubTopRepo } from '@pd/contracts';

/** The account as the service shows it now. */
export interface FetchedAccount {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
  joinedAt: string;
  /** `null` — the service has no such thing. */
  followers: number | null;
  following: number | null;
  /** Own repositories, forks left out. */
  repos: number;
  totalStars: number | null;
  languages: GithubLanguageShare[];
  topRepos: GithubTopRepo[];
}

export type ActivityKind = 'commit' | 'pullRequest' | 'review' | 'issue' | 'other';

/** Something the user did: a push, an opened merge request, a comment. */
export interface ActivityEvent {
  at: Date;
  kind: ActivityKind;
  /** What it adds to the calendar (a push is one contribution however many commits it has). */
  contributions: number;
  /** How many things of the `kind` it holds: the commits of a push. */
  amount: number;
}

/** What the account sync needs from a service; one implementation per service. */
export interface AccountSource {
  getAccount(): Promise<FetchedAccount>;
  /** Everything the user did since `since` (all there is when `null`). */
  getActivity(since: Date | null): Promise<ActivityEvent[]>;
}

/** The service did not accept the token. */
export class AccountAuthError extends Error {}
