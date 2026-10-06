import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DB, Database, Inspection, SecurityService } from '@pd/api-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { AccountTokensService } from './accounts/account-tokens.service';
import { GithubTokenService } from './github/github-token.service';
import { trackedRepos } from './open-source/open-source.schema';
import { HostingFacts, hostingProblems, RepositoryFacts } from './security/code-hosting-security';

const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;
/** A repository's own security check, if it has one (this repository does). */
const WORKFLOW = 'security.yml';
/** Repositories looked at per scan: the most recently pushed ones. */
const MAX_REPOSITORIES = 30;

interface GithubAnswer<T> {
  body: T | null;
  headers: Headers;
}

/**
 * The connected code hostings, for the security agent — the same GitHub, GitLab and Bitbucket
 * accounts the Development section reads (Settings → Integrations), nothing to set up apart:
 * whether the account has two-factor sign-in, when the dashboard's token expires and whether it
 * may do more than read, and — where the hosting tells — the alerts of the user's own
 * repositories (Dependabot, secret scanning, the repository's security workflow on GitHub).
 */
@Injectable()
export class DevelopmentSecurity implements OnModuleInit {
  private readonly logger = new Logger(DevelopmentSecurity.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly security: SecurityService,
    private readonly github: GithubTokenService,
    private readonly tokens: AccountTokensService,
  ) {}

  onModuleInit(): void {
    this.security.registerSource({
      id: 'code',
      area: 'repo',
      description:
        'The connected code hostings (GitHub, GitLab, Bitbucket): for each the account and ' +
        'whether it has two-factor sign-in, when the token the dashboard reads it with expires ' +
        "and its scopes, and for the owner's own GitHub repositories the open Dependabot " +
        "alerts by severity, open secret scanning alerts and the last run of the repository's " +
        'security workflow. `null` means the hosting does not tell.',
      inspect: (userId, locale) => this.inspect(userId, locale),
    });
  }

  /** `null` — no code hosting is connected. */
  private async inspect(userId: string, locale: string): Promise<Inspection | null> {
    const readers = [
      () => this.readGithub(userId),
      () => this.readGitlab(userId),
      () => this.readBitbucket(userId),
    ];
    const hostings: HostingFacts[] = [];
    for (const read of readers) {
      try {
        const facts = await read();
        if (facts) {
          hostings.push(facts);
        }
      } catch (error) {
        // One hosting being down (or its token refused) must not hide the others.
        this.logger.warn(`A code hosting was not read: ${String(error).slice(0, 200)}`);
      }
    }
    if (!hostings.length) {
      return null;
    }
    return { facts: hostings, problems: hostingProblems(hostings, locale, new Date()) };
  }

  private async readGithub(userId: string): Promise<HostingFacts | null> {
    const token = await this.github.token(userId);
    if (!token) {
      return null;
    }
    const ask = async <T>(path: string): Promise<GithubAnswer<T>> => {
      const response = await fetch(`${GITHUB_API}${path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'personal-dashboard',
        },
      });
      // 403/404: the feature is off for the repository, or the token may not read it.
      const body = response.ok ? ((await response.json()) as T) : null;
      if (!response.ok) {
        await response.body?.cancel();
      }
      return { body, headers: response.headers };
    };

    const user = await ask<{ login?: string; two_factor_authentication?: boolean }>('/user');
    // Classic tokens list their scopes; a fine-grained one sends an empty header.
    const scopes = user.headers.get('x-oauth-scopes');
    const expires = user.headers.get('github-authentication-token-expiration');
    const repositories: RepositoryFacts[] = [];
    for (const name of await this.ownRepositories(userId, 'github')) {
      const alerts = await ask<{ security_advisory?: { severity?: string } }[]>(
        `/repos/${name}/dependabot/alerts?state=open&per_page=100`,
      );
      const secrets = await ask<unknown[]>(
        `/repos/${name}/secret-scanning/alerts?state=open&per_page=100`,
      );
      const runs = await ask<{ workflow_runs?: { conclusion: string | null; html_url: string }[] }>(
        `/repos/${name}/actions/workflows/${WORKFLOW}/runs?per_page=1&status=completed`,
      );
      const run = runs.body?.workflow_runs?.[0];
      repositories.push({
        name,
        dependencies: alerts.body && countBySeverity(alerts.body),
        secrets: secrets.body && secrets.body.length,
        securityCheck: run ? { conclusion: run.conclusion, url: run.html_url } : null,
      });
    }
    return {
      hosting: 'github',
      account: {
        login: user.body?.login ?? null,
        twoFactor: user.body?.two_factor_authentication ?? null,
      },
      token: {
        expiresAt:
          expires && !Number.isNaN(Date.parse(expires)) ? new Date(expires).toISOString() : null,
        scopes: scopes ? scopes.split(',').map((scope) => scope.trim()) : null,
      },
      repositories,
    };
  }

  private async readGitlab(userId: string): Promise<HostingFacts | null> {
    const client = await this.tokens.gitlab(userId);
    if (!client) {
      return null;
    }
    const user = await client.get<{ username?: string; two_factor_enabled?: boolean }>('/user');
    const token = await client.get<{ expires_at?: string | null; scopes?: string[] }>(
      '/personal_access_tokens/self',
    );
    return {
      hosting: 'gitlab',
      account: { login: user?.username ?? null, twoFactor: user?.two_factor_enabled ?? null },
      token: {
        // A date without a time: the token works through that day.
        expiresAt: token?.expires_at ? `${token.expires_at}T23:59:59Z` : null,
        scopes: token?.scopes ?? null,
      },
      // GitLab tells about vulnerabilities only on its paid plans.
      repositories: [],
    };
  }

  private async readBitbucket(userId: string): Promise<HostingFacts | null> {
    const client = await this.tokens.bitbucket(userId);
    if (!client) {
      return null;
    }
    const user = await client.get<{
      username?: string;
      nickname?: string;
      has_2fa_enabled?: boolean | null;
    }>('/user');
    return {
      hosting: 'bitbucket',
      account: {
        login: user?.username ?? user?.nickname ?? null,
        twoFactor: typeof user?.has_2fa_enabled === 'boolean' ? user.has_2fa_enabled : null,
      },
      // Bitbucket tells neither the expiry nor the scopes of an API token.
      token: { expiresAt: null, scopes: null },
      repositories: [],
    };
  }

  /** The user's own repositories on a hosting (not forks, not archived), the freshest first. */
  private async ownRepositories(userId: string, provider: 'github'): Promise<string[]> {
    const rows = await this.db
      .select({ fullName: trackedRepos.fullName })
      .from(trackedRepos)
      .where(
        and(
          eq(trackedRepos.userId, userId),
          eq(trackedRepos.provider, provider),
          inArray(trackedRepos.relation, ['owner', 'organization']),
          eq(trackedRepos.isFork, false),
          eq(trackedRepos.isArchived, false),
        ),
      )
      .orderBy(desc(trackedRepos.pushedAt))
      .limit(MAX_REPOSITORIES);
    return rows.map((row) => row.fullName);
  }
}

function countBySeverity(alerts: { security_advisory?: { severity?: string } }[]) {
  const counts: Record<string, number> = {};
  for (const alert of alerts) {
    const severity = alert.security_advisory?.severity ?? 'low';
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return counts;
}
