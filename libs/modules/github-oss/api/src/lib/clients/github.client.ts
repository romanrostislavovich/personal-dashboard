const API = 'https://api.github.com';

export interface GithubRepo {
  fullName: string;
  htmlUrl: string;
  description: string | null;
  stars: number;
  forks: number;
  /** GitHub считает PR тоже issue, поэтому здесь issues + PR. */
  openIssuesAndPulls: number;
  pushedAt: string | null;
}

export interface GithubRelease {
  tag: string;
  publishedAt: string;
  htmlUrl: string;
}

export interface GithubIssue {
  title: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  isPullRequest: boolean;
}

export class GithubNotFoundError extends Error {}
export class GithubAuthError extends Error {}

/**
 * Минимальный клиент GitHub REST API — только то, что нужно модулю.
 * Без токена лимит — 60 запросов в час на IP, с токеном — 5000.
 */
export class GithubClient {
  constructor(private readonly token: string | null) {}

  async getRepo(fullName: string): Promise<GithubRepo> {
    const repo = await this.get<RawRepo>(`/repos/${fullName}`);
    return {
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssuesAndPulls: repo.open_issues_count,
      pushedAt: repo.pushed_at,
    };
  }

  /**
   * Количество открытых PR одним запросом: просим по 1 PR на страницу
   * и берём номер последней страницы из заголовка Link.
   */
  async countOpenPulls(fullName: string): Promise<number> {
    const response = await this.request(`/repos/${fullName}/pulls?state=open&per_page=1`);
    const lastPage = response.headers.get('link')?.match(/[?&]page=(\d+)>; rel="last"/);
    if (lastPage) {
      return Number(lastPage[1]);
    }
    return ((await response.json()) as unknown[]).length;
  }

  async getLatestRelease(fullName: string): Promise<GithubRelease | null> {
    try {
      const release = await this.get<RawRelease>(`/repos/${fullName}/releases/latest`);
      return {
        tag: release.tag_name,
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
      };
    } catch (error) {
      if (error instanceof GithubNotFoundError) {
        return null; // релизов ещё нет
      }
      throw error;
    }
  }

  /** Issues и PR, созданные после `since`. */
  async listCreatedSince(fullName: string, since: Date): Promise<GithubIssue[]> {
    // Параметр `since` у GitHub фильтрует по дате обновления, поэтому дофильтровываем по created_at.
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

  /** Проверка токена: вернёт логин владельца. */
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
    if (response.status === 404) {
      throw new GithubNotFoundError(`GitHub: ${path} not found`);
    }
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

// --- Сырые ответы GitHub API (только используемые поля) ---

interface RawRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string | null;
}

interface RawRelease {
  tag_name: string;
  published_at: string;
  html_url: string;
}

interface RawIssue {
  title: string;
  html_url: string;
  created_at: string;
  user: { login: string } | null;
  pull_request?: unknown;
}
