import { AccountAuthError } from '../accounts/account-source';
import { BitbucketClient, RawBitbucketRepo, RawBitbucketUser } from './bitbucket.client';

/**
 * Bitbucket moved the list of the user's workspaces more than once; the addresses are tried from
 * the newest to the oldest, and the first one that answers is used.
 */
const WORKSPACE_LISTS = ['/user/workspaces', '/user/permissions/workspaces', '/workspaces'];

interface RawWorkspaceRow {
  slug?: string;
  workspace?: { slug?: string };
}

/** The user behind the credentials and every repository they can see, workspace by workspace. */
export class BitbucketWorkspaces {
  private user: Promise<RawBitbucketUser> | null = null;
  private allRepos: Promise<RawBitbucketRepo[]> | null = null;

  constructor(private readonly bitbucket: BitbucketClient) {}

  me(): Promise<RawBitbucketUser> {
    this.user ??= this.bitbucket.get<RawBitbucketUser>('/user').then((user) => {
      if (!user) {
        throw new Error('Bitbucket did not return the account of the token');
      }
      return user;
    });
    return this.user;
  }

  /** Read once per sync: both the account and the repository list need it. */
  repos(): Promise<RawBitbucketRepo[]> {
    this.allRepos ??= this.readRepos();
    return this.allRepos;
  }

  private async readRepos(): Promise<RawBitbucketRepo[]> {
    const repos: RawBitbucketRepo[] = [];
    for (const slug of await this.workspaces()) {
      repos.push(...(await this.bitbucket.all<RawBitbucketRepo>(`/repositories/${slug}`)));
    }
    return repos;
  }

  private async workspaces(): Promise<string[]> {
    let lastError: unknown = new Error('Bitbucket did not list the workspaces');
    for (const path of WORKSPACE_LISTS) {
      try {
        const rows = await this.bitbucket.all<RawWorkspaceRow>(path);
        const slugs = rows.flatMap((row) => row.workspace?.slug ?? row.slug ?? []);
        if (slugs.length > 0) {
          return [...new Set(slugs)];
        }
      } catch (error) {
        if (error instanceof AccountAuthError) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError;
  }
}

/** `{uuid}` inside a Bitbucket query. */
export function quoted(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}
