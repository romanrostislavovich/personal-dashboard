import { GithubLanguageShare } from '@pd/contracts';
import { AccountSource, ActivityEvent, FetchedAccount } from '../accounts/account-source';
import { BitbucketClient, RawBitbucketRepo } from './bitbucket.client';
import { BitbucketWorkspaces, quoted } from './bitbucket-workspaces';

const TOP_REPOS = 10;
/**
 * Commits come newest first, but branches make the order loose: reading stops only after this
 * many commits in a row are older than what is asked for.
 */
const OLD_COMMITS_TO_STOP = 30;

interface RawCommit {
  date: string;
  author?: { raw?: string; user?: { uuid?: string } };
}

interface RawCreated {
  created_on: string;
}

/**
 * The Bitbucket account behind the credentials. Bitbucket has no activity calendar, followers or
 * stars, so the calendar is built here: the user's commits, pull requests and issues in every
 * repository they can see.
 */
export class BitbucketAccountSource implements AccountSource {
  constructor(
    private readonly bitbucket: BitbucketClient,
    private readonly workspaces: BitbucketWorkspaces,
    /** Commits made without a linked Bitbucket user are recognized by this e-mail. */
    private readonly email: string,
  ) {}

  async getAccount(): Promise<FetchedAccount> {
    const me = await this.workspaces.me();
    const own = (await this.workspaces.repos()).filter((repo) => !repo.parent);
    const recent = [...own].sort((a, b) => (b.updated_on ?? '').localeCompare(a.updated_on ?? ''));
    return {
      login: me.nickname ?? me.username ?? me.display_name ?? 'bitbucket',
      name: me.display_name,
      avatarUrl: me.links.avatar?.href ?? null,
      htmlUrl: me.links.html?.href ?? 'https://bitbucket.org',
      joinedAt: me.created_on,
      followers: null,
      following: null,
      repos: own.length,
      totalStars: null,
      languages: languageShares(own),
      topRepos: recent.slice(0, TOP_REPOS).map((repo) => ({
        fullName: repo.full_name,
        htmlUrl: repo.links.html?.href ?? `https://bitbucket.org/${repo.full_name}`,
        stars: 0,
        forks: 0,
        language: repo.language || null,
        isPrivate: repo.is_private,
      })),
    };
  }

  async getActivity(since: Date | null): Promise<ActivityEvent[]> {
    const me = await this.workspaces.me();
    const events: ActivityEvent[] = [];
    for (const repo of await this.workspaces.repos()) {
      // Nothing changed in the repository since then: no need to ask.
      if (since && repo.updated_on && new Date(repo.updated_on) < since) {
        continue;
      }
      events.push(...(await this.commits(repo, me.uuid, since)));
      events.push(...(await this.created(repo, 'pullrequests', 'author', me.uuid, since)));
      if (repo.has_issues) {
        events.push(...(await this.created(repo, 'issues', 'reporter', me.uuid, since)));
      }
    }
    return events;
  }

  private async commits(
    repo: RawBitbucketRepo,
    uuid: string,
    since: Date | null,
  ): Promise<ActivityEvent[]> {
    let oldInRow = 0;
    const commits = await this.bitbucket.all<RawCommit>(
      `/repositories/${repo.full_name}/commits`,
      { fields: 'values.date,values.author.raw,values.author.user.uuid,next' },
      (commit) => {
        oldInRow = since && new Date(commit.date) < since ? oldInRow + 1 : 0;
        return oldInRow >= OLD_COMMITS_TO_STOP;
      },
    );
    const email = `<${this.email.toLowerCase()}>`;
    return commits
      .filter((commit) => !since || new Date(commit.date) >= since)
      .filter(
        (commit) =>
          commit.author?.user?.uuid === uuid ||
          (commit.author?.raw ?? '').toLowerCase().includes(email),
      )
      .map((commit) => ({
        at: new Date(commit.date),
        kind: 'commit',
        contributions: 1,
        amount: 1,
      }));
  }

  /** Pull requests or issues the user created. */
  private async created(
    repo: RawBitbucketRepo,
    list: 'pullrequests' | 'issues',
    by: 'author' | 'reporter',
    uuid: string,
    since: Date | null,
  ): Promise<ActivityEvent[]> {
    const conditions = [
      `${by}.uuid=${quoted(uuid)}`,
      ...(since ? [`created_on>=${since.toISOString()}`] : []),
      // Without a state Bitbucket lists only the open pull requests.
      ...(list === 'pullrequests'
        ? ['(state="OPEN" OR state="MERGED" OR state="DECLINED" OR state="SUPERSEDED")']
        : []),
    ];
    const rows = await this.bitbucket.all<RawCreated>(`/repositories/${repo.full_name}/${list}`, {
      q: conditions.join(' AND '),
      pagelen: '50',
      fields: 'values.created_on,next',
    });
    return rows.map((row) => ({
      at: new Date(row.created_on),
      kind: list === 'pullrequests' ? 'pullRequest' : 'issue',
      contributions: 1,
      amount: 1,
    }));
  }
}

/**
 * Bitbucket knows one language per repository (the one set in its settings): repositories are
 * weighed by their size.
 */
export function languageShares(
  repos: Pick<RawBitbucketRepo, 'language' | 'size'>[],
): GithubLanguageShare[] {
  const shares = new Map<string, number>();
  for (const repo of repos) {
    if (repo.language) {
      shares.set(repo.language, (shares.get(repo.language) ?? 0) + (repo.size ?? 0));
    }
  }
  return [...shares.entries()]
    .map(([name, bytes]) => ({ name, color: null, bytes }))
    .sort((a, b) => b.bytes - a.bytes);
}
