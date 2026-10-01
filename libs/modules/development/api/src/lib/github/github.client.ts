const API = 'https://api.github.com';

export interface GithubIssue {
  title: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  isPullRequest: boolean;
}

export class GithubAuthError extends Error {}

/**
 * Minimal GitHub REST API client — the token check and the list of new issues and PRs.
 * Repositories and the account are read over GraphQL (github-graphql.ts).
 */
export class GithubClient {
  constructor(private readonly token: string | null) {}

  /** Issues and PRs created after `since`. */
  async listCreatedSince(fullName: string, since: Date): Promise<GithubIssue[]> {
    // GitHub's `since` parameter filters by update date, so we also filter by created_at.
    const issues = await this.get<RawIssue[]>(
      `/repos/${fullName}/issues?state=all&sort=created&direction=desc&per_page=30&since=${since.toISOString()}`,
    );
    return issues
      .filter((issue) => new Date(issue.created_at) > since)
      .map((issue) => ({
        title: issue.title,
        htmlUrl: issue.html_url,
        author: issue.user?.login ?? 'unknown',
        createdAt: issue.created_at,
        isPullRequest: Boolean(issue.pull_request),
      }));
  }

  /** Token check: returns the owner's login. */
  async getViewerLogin(): Promise<string> {
    return (await this.get<{ login: string }>('/user')).login;
  }

  private async get<T>(path: string): Promise<T> {
    return (await (await this.request(path)).json()) as T;
  }

  private async request(path: string): Promise<Response> {
    const response = await fetch(API + path, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'personal-dashboard',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    if (response.status === 401) {
      throw new GithubAuthError('GitHub token is invalid');
    }
    if (!response.ok) {
      const reset = response.headers.get('x-ratelimit-remaining') === '0' ? ' (rate limit)' : '';
      throw new Error(`GitHub ${response.status}${reset}: ${path}`);
    }
    return response;
  }
}

// --- Raw GitHub API responses (only the fields we use) ---

interface RawIssue {
  title: string;
  html_url: string;
  created_at: string;
  user: { login: string } | null;
  pull_request?: unknown;
}
