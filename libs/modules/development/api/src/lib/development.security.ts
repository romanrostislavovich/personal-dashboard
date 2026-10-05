import { Injectable, OnModuleInit } from '@nestjs/common';
import { Inspection, SecurityService } from '@pd/api-core';
import { GithubTokenService } from './github/github-token.service';
import { RepositoryFacts, repositoryProblems } from './security/repository-security';

const API = 'https://api.github.com';
const TIMEOUT_MS = 15_000;
/** The workflow of this repository that looks for leaked secrets and audits the packages. */
const WORKFLOW = 'security.yml';

interface DependabotAlert {
  dependency?: { package?: { name?: string } };
  security_advisory?: { severity?: string; summary?: string };
}

/**
 * The repository on GitHub, for the security agent: the last run of its security workflow, open
 * Dependabot alerts and secret scanning alerts. Which repository — the user sets in the Security
 * section; it is read with the GitHub token of Settings → Integrations.
 */
@Injectable()
export class DevelopmentSecurity implements OnModuleInit {
  constructor(
    private readonly security: SecurityService,
    private readonly tokens: GithubTokenService,
  ) {}

  onModuleInit(): void {
    this.security.registerSource({
      id: 'repository',
      area: 'repo',
      description:
        'The repository on GitHub: the last run of its security workflow (a scan of the git ' +
        'history for leaked secrets and npm audit), open Dependabot alerts with the worst ' +
        'packages, open secret scanning alerts, and what GitHub would not let read.',
      inspect: (userId, locale) => this.inspect(userId, locale),
    });
  }

  /** `null` — no repository is named, or there is no GitHub token to ask with. */
  private async inspect(userId: string, locale: string): Promise<Inspection | null> {
    const { repository } = await this.security.settings(userId);
    const token = await this.tokens.token(userId);
    if (!repository || !token) {
      return null;
    }
    const unread: string[] = [];
    const ask = async <T>(name: string, path: string): Promise<T | null> => {
      const response = await fetch(`${API}/repos/${repository}/${path}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!response.ok) {
        // 403/404: the feature is off for the repository, or the token may not read it.
        unread.push(`${name}: HTTP ${response.status}`);
        await response.body?.cancel();
        return null;
      }
      return (await response.json()) as T;
    };

    const runs = await ask<{
      workflow_runs: { conclusion: string | null; created_at: string; html_url: string }[];
    }>('workflow', `actions/workflows/${WORKFLOW}/runs?per_page=1&status=completed`);
    const alerts = await ask<DependabotAlert[]>(
      'dependabot',
      'dependabot/alerts?state=open&per_page=100',
    );
    const secrets = await ask<unknown[]>(
      'secret scanning',
      'secret-scanning/alerts?state=open&per_page=100',
    );

    const run = runs?.workflow_runs[0];
    const bySeverity: Record<string, number> = {};
    for (const alert of alerts ?? []) {
      const severity = alert.security_advisory?.severity ?? 'low';
      bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
    }
    const facts: RepositoryFacts = {
      repository,
      workflow: run ? { conclusion: run.conclusion, at: run.created_at, url: run.html_url } : null,
      dependencies: alerts && {
        open: alerts.length,
        bySeverity,
        worst: alerts
          .filter((alert) => ['critical', 'high'].includes(alert.security_advisory?.severity ?? ''))
          .slice(0, 10)
          .map((alert) => ({
            package: alert.dependency?.package?.name ?? '?',
            severity: alert.security_advisory?.severity ?? '?',
            summary: (alert.security_advisory?.summary ?? '').slice(0, 200),
          })),
      },
      secrets: secrets && { open: secrets.length },
      unread,
    };
    return { facts, problems: repositoryProblems(facts, locale) };
  }
}
