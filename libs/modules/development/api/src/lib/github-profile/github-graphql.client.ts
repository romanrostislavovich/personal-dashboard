import { GithubContributionDay, GithubLanguageShare, GithubTopRepo } from '@pd/contracts';
import { GithubAuthError } from '../github/github.client';

const GRAPHQL_URL = 'https://api.github.com/graphql';
/** GitHub returns at most 100 repositories a page; the most starred ones are enough here. */
const MAX_REPOS = 100;
const LANGUAGES_PER_REPO = 10;

export interface GithubViewer {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  joinedAt: string;
  followers: number;
  following: number;
  /** Own repositories, forks left out. */
  repos: number;
  totalStars: number;
  languages: GithubLanguageShare[];
  /** By stars. */
  topRepos: GithubTopRepo[];
}

export interface GithubYearContributions {
  contributions: number;
  commits: number;
  pullRequests: number;
  reviews: number;
  issues: number;
  restricted: number;
  days: GithubContributionDay[];
}

const VIEWER_QUERY = `
  query {
    viewer {
      login
      name
      avatarUrl
      url
      createdAt
      followers { totalCount }
      following { totalCount }
      repositories(
        first: ${MAX_REPOS}
        ownerAffiliations: OWNER
        isFork: false
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        totalCount
        nodes {
          nameWithOwner
          url
          stargazerCount
          forkCount
          isPrivate
          primaryLanguage { name }
          languages(first: ${LANGUAGES_PER_REPO}, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }`;

const YEAR_QUERY = `
  query ($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
        totalIssueContributions
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount } }
        }
      }
    }
  }`;

/**
 * The account behind the token (GitHub GraphQL API): the contribution calendar exists only there.
 * Private contributions are counted because the token asks about its own owner.
 */
export class GithubGraphqlClient {
  constructor(private readonly token: string) {}

  async getViewer(): Promise<GithubViewer> {
    const { viewer } = await this.query<{ viewer: RawViewer }>(VIEWER_QUERY);
    const repos = viewer.repositories.nodes;
    return {
      login: viewer.login,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl,
      htmlUrl: viewer.url,
      joinedAt: viewer.createdAt,
      followers: viewer.followers.totalCount,
      following: viewer.following.totalCount,
      repos: viewer.repositories.totalCount,
      totalStars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
      languages: languageShares(repos),
      topRepos: repos.map((repo) => ({
        fullName: repo.nameWithOwner,
        htmlUrl: repo.url,
        stars: repo.stargazerCount,
        forks: repo.forkCount,
        language: repo.primaryLanguage?.name ?? null,
        isPrivate: repo.isPrivate,
      })),
    };
  }

  /** The calendar and the totals of one year (GitHub answers for at most a year at a time). */
  async getYear(year: number): Promise<GithubYearContributions> {
    const { viewer } = await this.query<{ viewer: { contributionsCollection: RawYear } }>(
      YEAR_QUERY,
      { from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    );
    const collection = viewer.contributionsCollection;
    return {
      contributions: collection.contributionCalendar.totalContributions,
      commits: collection.totalCommitContributions,
      pullRequests: collection.totalPullRequestContributions,
      reviews: collection.totalPullRequestReviewContributions,
      issues: collection.totalIssueContributions,
      restricted: collection.restrictedContributionsCount,
      days: collection.contributionCalendar.weeks
        .flatMap((week) => week.contributionDays)
        // A week on the edge of the range may reach into the next year.
        .filter((day) => day.date.startsWith(`${year}-`))
        .map((day) => ({ day: day.date, count: day.contributionCount })),
    };
  }

  private async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'personal-dashboard',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 401) {
      throw new GithubAuthError('GitHub token is invalid');
    }
    if (!response.ok) {
      throw new Error(`GitHub GraphQL ${response.status}`);
    }
    // GraphQL reports its errors (a missing permission, a rate limit) with status 200.
    const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length || !body.data) {
      throw new Error(`GitHub: ${body.errors?.map((error) => error.message).join('; ')}`);
    }
    return body.data;
  }
}

/** Bytes of code per language across the repositories, largest first. */
export function languageShares(repos: Pick<RawRepo, 'languages'>[]): GithubLanguageShare[] {
  const shares = new Map<string, GithubLanguageShare>();
  for (const { size, node } of repos.flatMap((repo) => repo.languages.edges)) {
    const share = shares.get(node.name) ?? { name: node.name, color: node.color, bytes: 0 };
    share.bytes += size;
    shares.set(node.name, share);
  }
  return [...shares.values()].sort((a, b) => b.bytes - a.bytes);
}

// --- Raw GitHub API responses (only the fields we ask for) ---

interface RawViewer {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
  createdAt: string;
  followers: { totalCount: number };
  following: { totalCount: number };
  repositories: { totalCount: number; nodes: RawRepo[] };
}

interface RawRepo {
  nameWithOwner: string;
  url: string;
  stargazerCount: number;
  forkCount: number;
  isPrivate: boolean;
  primaryLanguage: { name: string } | null;
  languages: { edges: { size: number; node: { name: string; color: string | null } }[] };
}

interface RawYear {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  restrictedContributionsCount: number;
  contributionCalendar: {
    totalContributions: number;
    weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
  };
}
