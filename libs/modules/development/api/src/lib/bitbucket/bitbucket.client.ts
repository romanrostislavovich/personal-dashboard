import { AccountAuthError } from '../accounts/account-source';

const API = 'https://api.bitbucket.org/2.0';
const TIMEOUT_MS = 30_000;
/** A guard against an endless listing. */
const MAX_PAGES = 200;

/** The Atlassian account's e-mail and its API token: Bitbucket signs in with the pair. */
export interface BitbucketCredentials {
  email: string;
  token: string;
}

interface Page<T> {
  values?: T[];
  next?: string;
  size?: number;
}

/** Bitbucket Cloud REST API 2.0. */
export class BitbucketClient {
  private readonly authorization: string;

  constructor(credentials: BitbucketCredentials) {
    this.authorization = `Basic ${Buffer.from(`${credentials.email}:${credentials.token}`).toString('base64')}`;
  }

  /** One object; `null` when Bitbucket answers 404 (a deleted or private repository). */
  async get<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
    const response = await this.request(url(path, params));
    return response ? ((await response.json()) as T) : null;
  }

  /** How many rows a list has, without reading them; `0` when there is no such list. */
  async count(path: string, params: Record<string, string> = {}): Promise<number> {
    const page = await this.get<Page<unknown>>(path, { ...params, pagelen: '1', fields: 'size' });
    return page?.size ?? 0;
  }

  /**
   * The rows of a list, page after page (Bitbucket gives the address of the next one), until
   * `stop` says a row is past what is needed — lists come newest first.
   */
  async all<T>(
    path: string,
    params: Record<string, string> = {},
    stop: (row: T) => boolean = () => false,
  ): Promise<T[]> {
    const rows: T[] = [];
    let next: string | undefined = url(path, { pagelen: '100', ...params });
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const response = await this.request(next);
      if (!response) {
        break;
      }
      const body = (await response.json()) as Page<T>;
      for (const row of body.values ?? []) {
        if (stop(row)) {
          return rows;
        }
        rows.push(row);
      }
      next = body.next;
    }
    return rows;
  }

  /** `null` for 404. */
  private async request(address: string): Promise<Response | null> {
    const response = await fetch(address, {
      headers: {
        Authorization: this.authorization,
        Accept: 'application/json',
        'User-Agent': 'personal-dashboard',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) {
      return response;
    }
    if (response.status === 401) {
      throw new AccountAuthError('Bitbucket did not accept the e-mail and the API token');
    }
    if (response.status === 404) {
      return null;
    }
    const path = address.replace(API, '').split('?')[0];
    // Bitbucket explains itself: a missing scope of the token, a rate limit.
    const said = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`Bitbucket ${response.status}: ${path}${said ? ` — ${said}` : ''}`);
  }
}

function url(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return `${API}${path}${query ? `?${query}` : ''}`;
}

// --- Raw Bitbucket API responses (only the fields we use) ---

export interface RawBitbucketUser {
  uuid: string;
  display_name: string | null;
  nickname?: string;
  username?: string;
  created_on: string;
  links: { avatar?: { href: string }; html?: { href: string } };
}

export interface RawBitbucketRepo {
  uuid: string;
  /** `workspace/slug` */
  full_name: string;
  description: string | null;
  is_private: boolean;
  language: string | null;
  size?: number;
  updated_on: string | null;
  parent?: unknown;
  owner?: { uuid?: string };
  links: { html?: { href: string } };
}
