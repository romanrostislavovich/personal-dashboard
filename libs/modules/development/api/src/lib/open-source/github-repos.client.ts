import { githubGraphql } from '../github/github-graphql';
import { AccountRepo, RepoSnapshot } from './repo-source';

/** GitHub returns at most 100 repositories a page; package.json texts make a page heavy. */
const PAGE_SIZE = 50;
/** Repositories asked for by name in one request. */
const LOOKUP_CHUNK = 40;

const REPO_FIELDS = `
  id
  nameWithOwner
  url
  description
  isFork
  isArchived
  stargazerCount
  forkCount
  pushedAt
  owner { login }
  primaryLanguage { name }
  issues(states: OPEN) { totalCount }
  pullRequests(states: OPEN) { totalCount }
  latestRelease { tagName publishedAt url }
  packageJson: object(expression: "HEAD:package.json") { ... on Blob { text } }`;

const ACCOUNT_QUERY = `
  query ($cursor: String) {
    viewer {
      login
      repositories(
        first: ${PAGE_SIZE}
        after: $cursor
        privacy: PUBLIC
        affiliations: [OWNER, ORGANIZATION_MEMBER]
        ownerAffiliations: [OWNER, ORGANIZATION_MEMBER]
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes { ${REPO_FIELDS} }
      }
    }
  }`;

/** Repositories over the GitHub GraphQL API: a whole account or a list of names in one request. */
export class GithubReposClient {
  constructor(private readonly token: string) {}

  /** Every public repository of the token's owner and of the organizations they belong to. */
  async listAccount(): Promise<AccountRepo[]> {
    const repos: AccountRepo[] = [];
    let cursor: string | null = null;
    do {
      const { viewer }: AccountPage = await githubGraphql<AccountPage>(this.token, ACCOUNT_QUERY, {
        cursor,
      });
      for (const raw of viewer.repositories.nodes) {
        repos.push({
          ...toSnapshot(raw),
          relation: raw.owner.login === viewer.login ? 'owner' : 'organization',
        });
      }
      const page: PageInfo = viewer.repositories.pageInfo;
      cursor = page.hasNextPage ? page.endCursor : null;
    } while (cursor);
    return repos;
  }

  /**
   * Repositories by name, in the order asked; `null` — not found (deleted, private, a typo).
   * Names are `owner/name` checked by the contracts schema, so they are safe inside the query.
   */
  async getMany(fullNames: string[]): Promise<(RepoSnapshot | null)[]> {
    const found: (RepoSnapshot | null)[] = [];
    for (let i = 0; i < fullNames.length; i += LOOKUP_CHUNK) {
      const chunk = fullNames.slice(i, i + LOOKUP_CHUNK);
      const fields = chunk.map((fullName, index) => {
        const [owner, name] = fullName.split('/');
        return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${REPO_FIELDS} }`;
      });
      const data = await githubGraphql<Record<string, RawRepo | null>>(
        this.token,
        `query { ${fields.join('\n')} }`,
        {},
        { allowPartial: true },
      );
      chunk.forEach((_, index) => {
        const raw = data[`r${index}`];
        found.push(raw ? toSnapshot(raw) : null);
      });
    }
    return found;
  }
}

function toSnapshot(raw: RawRepo): RepoSnapshot {
  return {
    externalId: raw.id,
    fullName: raw.nameWithOwner,
    htmlUrl: raw.url,
    description: raw.description,
    language: raw.primaryLanguage?.name ?? null,
    isFork: raw.isFork,
    isArchived: raw.isArchived,
    stars: raw.stargazerCount,
    forks: raw.forkCount,
    openIssues: raw.issues.totalCount,
    openPulls: raw.pullRequests.totalCount,
    pushedAt: raw.pushedAt,
    latestRelease: raw.latestRelease?.publishedAt
      ? {
          tag: raw.latestRelease.tagName,
          publishedAt: raw.latestRelease.publishedAt,
          htmlUrl: raw.latestRelease.url,
        }
      : null,
    packageName: packageNameFrom(raw.packageJson?.text ?? null),
  };
}

/** The npm package a repository publishes: the `name` of its package.json unless it is private. */
export function packageNameFrom(packageJson: string | null): string | null {
  if (!packageJson) {
    return null;
  }
  try {
    const { name, private: isPrivate } = JSON.parse(packageJson) as {
      name?: unknown;
      private?: unknown;
    };
    return typeof name === 'string' && name && isPrivate !== true ? name : null;
  } catch {
    return null; // not JSON — a template, a broken file
  }
}

// --- Raw GitHub API responses (only the fields we ask for) ---

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface AccountPage {
  viewer: { login: string; repositories: { pageInfo: PageInfo; nodes: RawRepo[] } };
}

interface RawRepo {
  id: string;
  nameWithOwner: string;
  url: string;
  description: string | null;
  isFork: boolean;
  isArchived: boolean;
  stargazerCount: number;
  forkCount: number;
  pushedAt: string | null;
  owner: { login: string };
  primaryLanguage: { name: string } | null;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  latestRelease: { tagName: string; publishedAt: string | null; url: string } | null;
  packageJson: { text?: string | null } | null;
}
