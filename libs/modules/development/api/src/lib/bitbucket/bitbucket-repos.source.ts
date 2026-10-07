import { AccountRepo, RepoIssue, RepoSnapshot, RepoSource } from '../open-source/repo-source';
import { BitbucketClient, RawBitbucketRepo } from './bitbucket.client';
import { BitbucketWorkspaces } from './bitbucket-workspaces';

const NEW_ITEMS = '30';

interface RawItem {
  title: string;
  created_on: string;
  links?: { html?: { href: string } };
  author?: { display_name?: string };
}

/** Bitbucket repositories for the Development section. */
export class BitbucketRepoSource implements RepoSource {
  readonly provider = 'bitbucket';

  constructor(
    private readonly bitbucket: BitbucketClient,
    private readonly workspaces: BitbucketWorkspaces,
  ) {}

  /** The repositories of every workspace the user belongs to. */
  async listAccount(): Promise<AccountRepo[]> {
    const me = await this.workspaces.me();
    const repos: AccountRepo[] = [];
    for (const repo of await this.workspaces.repos()) {
      if (repo.is_private) {
        continue;
      }
      repos.push({
        ...(await this.snapshot(repo)),
        // A personal workspace has the uuid of its user.
        relation: repo.owner?.uuid === me.uuid ? 'owner' : 'organization',
      });
    }
    return repos;
  }

  async getMany(fullNames: string[]): Promise<(RepoSnapshot | null)[]> {
    const found: (RepoSnapshot | null)[] = [];
    for (const fullName of fullNames) {
      const repo = await this.bitbucket.get<RawBitbucketRepo>(`/repositories/${fullName}`);
      found.push(repo ? await this.snapshot(repo) : null);
    }
    return found;
  }

  /** New pull requests only: Bitbucket retired its issue tracker. */
  async listCreatedSince(fullName: string, since: Date): Promise<RepoIssue[]> {
    const page = await this.bitbucket.get<{ values?: RawItem[] }>(
      `/repositories/${fullName}/pullrequests`,
      {
        q: `created_on>${since.toISOString()} AND (state="OPEN" OR state="MERGED" OR state="DECLINED")`,
        pagelen: NEW_ITEMS,
      },
    );
    return (page?.values ?? []).map((raw) => ({
      title: raw.title,
      htmlUrl: raw.links?.html?.href ?? `https://bitbucket.org/${fullName}`,
      author: raw.author?.display_name ?? 'unknown',
      createdAt: raw.created_on,
      isPullRequest: true,
    }));
  }

  /**
   * Bitbucket has no stars, no releases and no issues any more: its watchers stand for the
   * stars. The counters are a request each.
   */
  private async snapshot(repo: RawBitbucketRepo): Promise<RepoSnapshot> {
    const base = `/repositories/${repo.full_name}`;
    const [watchers, forks, openPulls] = await Promise.all([
      this.bitbucket.count(`${base}/watchers`),
      this.bitbucket.count(`${base}/forks`),
      this.bitbucket.count(`${base}/pullrequests`, { state: 'OPEN' }),
    ]);
    return {
      externalId: repo.uuid,
      fullName: repo.full_name,
      htmlUrl: repo.links.html?.href ?? `https://bitbucket.org/${repo.full_name}`,
      description: repo.description || null,
      language: repo.language || null,
      isFork: Boolean(repo.parent),
      isArchived: false,
      isPrivate: repo.is_private,
      stars: watchers,
      forks,
      openIssues: 0,
      openPulls,
      pushedAt: repo.updated_on,
      latestRelease: null,
      packageName: null,
    };
  }
}
