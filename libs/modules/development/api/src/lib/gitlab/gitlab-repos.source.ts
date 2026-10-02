import { AccountRepo, RepoIssue, RepoSnapshot, RepoSource } from '../open-source/repo-source';
import { GitlabClient, projectPath, RawGitlabProject, RawGitlabUser } from './gitlab.client';

const NEW_ITEMS = '30';

/** Public GitLab projects for the Open Source section. */
export class GitlabRepoSource implements RepoSource {
  readonly provider = 'gitlab';

  constructor(private readonly gitlab: GitlabClient) {}

  /** The public projects the user is a member of: their own and those of their groups. */
  async listAccount(): Promise<AccountRepo[]> {
    const me = await this.gitlab.get<RawGitlabUser>('/user');
    const projects = await this.gitlab.all<RawGitlabProject>('/projects', {
      membership: 'true',
      visibility: 'public',
    });
    const repos: AccountRepo[] = [];
    for (const project of projects) {
      const own = project.namespace.kind === 'user' && project.namespace.path === me?.username;
      repos.push({ ...(await this.snapshot(project)), relation: own ? 'owner' : 'organization' });
    }
    return repos;
  }

  async getMany(fullNames: string[]): Promise<(RepoSnapshot | null)[]> {
    const found: (RepoSnapshot | null)[] = [];
    for (const fullName of fullNames) {
      const project = await this.gitlab.get<RawGitlabProject>(projectPath(fullName));
      found.push(project ? await this.snapshot(project) : null);
    }
    return found;
  }

  async listCreatedSince(fullName: string, since: Date): Promise<RepoIssue[]> {
    const params = { created_after: since.toISOString(), per_page: NEW_ITEMS };
    const [issues, mergeRequests] = await Promise.all([
      this.gitlab.page<RawItem>(`${projectPath(fullName)}/issues`, params),
      this.gitlab.page<RawItem>(`${projectPath(fullName)}/merge_requests`, params),
    ]);
    const item = (raw: RawItem, isPullRequest: boolean): RepoIssue => ({
      title: raw.title,
      htmlUrl: raw.web_url,
      author: raw.author?.username ?? 'unknown',
      createdAt: raw.created_at,
      isPullRequest,
    });
    return [
      ...issues.rows.map((raw) => item(raw, false)),
      ...mergeRequests.rows.map((raw) => item(raw, true)),
    ];
  }

  /**
   * The project list has no open merge requests, releases or languages: a request each.
   * (A package.json would be one more — npm packages of GitLab projects are set by hand.)
   */
  private async snapshot(project: RawGitlabProject): Promise<RepoSnapshot> {
    const path = `/projects/${project.id}`;
    const [mergeRequests, releases, languages] = await Promise.all([
      this.gitlab.page<unknown>(`${path}/merge_requests`, { state: 'opened', per_page: '1' }),
      this.gitlab.page<RawRelease>(`${path}/releases`, { per_page: '1' }),
      this.gitlab.get<Record<string, number>>(`${path}/languages`),
    ]);
    const release = releases.rows[0];
    const [language] = Object.entries(languages ?? {}).sort((a, b) => b[1] - a[1])[0] ?? [null];
    return {
      externalId: String(project.id),
      fullName: project.path_with_namespace,
      htmlUrl: project.web_url,
      description: project.description || null,
      language,
      isFork: Boolean(project.forked_from_project),
      isArchived: project.archived,
      stars: project.star_count,
      forks: project.forks_count,
      openIssues: project.open_issues_count ?? 0,
      openPulls: mergeRequests.total ?? mergeRequests.rows.length,
      pushedAt: project.last_activity_at,
      latestRelease: release?.released_at
        ? {
            tag: release.tag_name,
            publishedAt: release.released_at,
            htmlUrl: release._links?.self ?? `${project.web_url}/-/releases`,
          }
        : null,
      packageName: null,
    };
  }
}

// --- Raw GitLab API responses (only the fields we use) ---

interface RawItem {
  title: string;
  web_url: string;
  created_at: string;
  author: { username: string } | null;
}

interface RawRelease {
  tag_name: string;
  released_at: string | null;
  _links?: { self?: string };
}
