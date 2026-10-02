import { AccountRepo, RepoIssue, RepoSnapshot, RepoSource } from '../open-source/repo-source';
import { BitbucketClient, RawBitbucketRepo } from './bitbucket.client';
import { BitbucketWorkspaces } from './bitbucket-workspaces';

const NEW_ITEMS = '30';

interface RawItem {
  title: string;
  created_on: string;
  links?: { html?: { href: string } };
  author?: { display_name?: string };
  reporter?: { display_name?: string };
}

/** Public Bitbucket repositories for the Open Source section. */
export class BitbucketRepoSource implements RepoSource {
  readonly provider = 'bitbucket';

  constructor(
    private readonly bitbucket: BitbucketClient,
    private readonly workspaces: BitbucketWorkspaces,
  ) {}

  /** The public repositories of every workspace the user belongs to. */
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

  async listCreatedSince(fullName: string, since: Date): Promise<RepoIssue[]> {
    const base = `/repositories/${fullName}`;
    const created = `created_on>${since.toISOString()}`;
    const [issues, pulls] = await Promise.all([
      this.page(`${base}/issues`, created),
      this.page(
        `${base}/pullrequests`,
        `${created} AND (state="OPEN" OR state="MERGED" OR state="DECLINED")`,
      ),
    ]);
    const item = (raw: RawItem, isPullRequest: boolean): RepoIssue => ({
      title: raw.title,
      htmlUrl: raw.links?.html?.href ?? `https://bitbucket.org/${fullName}`,
      author: (isPullRequest ? raw.author : raw.reporter)?.display_name ?? 'unknown',
      createdAt: raw.created_on,
      isPullRequest,
    });
    return [...issues.map((raw) => item(raw, false)), ...pulls.map((raw) => item(raw, true))];
  }

  private async page(path: string, q: string): Promise<RawItem[]> {
    const page = await this.bitbucket.get<{ values?: RawItem[] }>(path, { q, pagelen: NEW_ITEMS });
    return page?.values ?? [];
  }

  /**
   * Bitbucket has no stars and no releases: its watchers stand for the stars. The counters are
   * a request each.
   */
  private async snapshot(repo: RawBitbucketRepo): Promise<RepoSnapshot> {
    const base = `/repositories/${repo.full_name}`;
    const [watchers, forks, openPulls, openIssues] = await Promise.all([
      this.bitbucket.count(`${base}/watchers`),
      this.bitbucket.count(`${base}/forks`),
      this.bitbucket.count(`${base}/pullrequests`, { state: 'OPEN' }),
      repo.has_issues
        ? this.bitbucket.count(`${base}/issues`, { q: '(state="new" OR state="open")' })
        : 0,
    ]);
    return {
      externalId: repo.uuid,
      fullName: repo.full_name,
      htmlUrl: repo.links.html?.href ?? `https://bitbucket.org/${repo.full_name}`,
      description: repo.description || null,
      language: repo.language || null,
      isFork: Boolean(repo.parent),
      isArchived: false,
      stars: watchers,
      forks,
      openIssues,
      openPulls,
      pushedAt: repo.updated_on,
      latestRelease: null,
      packageName: null,
    };
  }
}
