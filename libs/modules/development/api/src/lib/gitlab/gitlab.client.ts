import { AccountAuthError } from '../accounts/account-source';

const API = 'https://gitlab.com/api/v4';
const TIMEOUT_MS = 30_000;
/** GitLab's largest page. */
export const GITLAB_PAGE = 100;
/** A guard against an endless listing: 300 pages are 30,000 rows. */
const MAX_PAGES = 300;

export interface GitlabPage<T> {
  rows: T[];
  /** The `X-Total` header; GitLab leaves it out of very long lists. */
  total: number | null;
}

/** GitLab REST API (gitlab.com) with the user's personal access token. */
export class GitlabClient {
  constructor(private readonly token: string) {}

  /** One object; `null` when GitLab answers 404 (a deleted or private project). */
  async get<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    const response = await this.request(path, params, [404]);
    return response ? ((await response.json()) as T) : null;
  }

  /** One page of a list with the total GitLab reports for it. */
  async page<T>(path: string, params: Record<string, string> = {}): Promise<GitlabPage<T>> {
    const response = await this.request(path, params, [404]);
    if (!response) {
      return { rows: [], total: 0 };
    }
    const total = response.headers.get('x-total');
    return { rows: (await response.json()) as T[], total: total ? Number(total) : null };
  }

  /** Every row of a list, page after page. */
  async all<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.request(
        path,
        { ...params, per_page: String(GITLAB_PAGE), page: String(page) },
        [404],
      );
      if (!response) {
        break;
      }
      rows.push(...((await response.json()) as T[]));
      if (!response.headers.get('x-next-page')) {
        break;
      }
    }
    return rows;
  }

  /** `null` for a status listed in `tolerate`. */
  private async request(
    path: string,
    params: Record<string, string>,
    tolerate: number[],
  ): Promise<Response | null> {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${API}${path}${query ? `?${query}` : ''}`, {
      headers: { 'PRIVATE-TOKEN': this.token, 'User-Agent': 'personal-dashboard' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      return response;
    }
    if (response.status === 401) {
      throw new AccountAuthError('GitLab token is invalid');
    }
    if (tolerate.includes(response.status)) {
      return null;
    }
    // GitLab explains itself: "insufficient_scope", a rate limit.
    const said = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`GitLab ${response.status}: ${path}${said ? ` — ${said}` : ''}`);
  }
}

/** A project path as GitLab takes it in an address: `group%2Fname`. */
export function projectPath(fullName: string): string {
  return `/projects/${encodeURIComponent(fullName)}`;
}

// --- Raw GitLab API responses (only the fields we use) ---

export interface RawGitlabUser {
  id: number;
  username: string;
  name: string | null;
  avatar_url: string | null;
  web_url: string;
  created_at: string;
  followers?: number;
  following?: number;
}

export interface RawGitlabProject {
  id: number;
  path_with_namespace: string;
  web_url: string;
  description: string | null;
  visibility: string;
  archived: boolean;
  star_count: number;
  forks_count: number;
  /** Absent when the project has its issues switched off. */
  open_issues_count?: number;
  last_activity_at: string | null;
  forked_from_project?: unknown;
  namespace: { kind: string; path: string };
  statistics?: { repository_size: number };
}

export interface RawGitlabEvent {
  action_name: string;
  target_type: string | null;
  created_at: string;
  push_data?: { commit_count: number };
  note?: { noteable_type?: string };
}
