import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DB, Database, IntegrationReport, IntegrationsService } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { AccountTokensService } from './accounts/account-tokens.service';
import { codeAccounts } from './accounts/accounts.schema';
import { GithubTokenService } from './github/github-token.service';
import { GithubClient } from './github/github.client';
import { githubProfiles } from './github-profile/github-profile.schema';
import { trackedRepos } from './open-source/open-source.schema';
import { gitlabTokenExpiry } from './token-expiry';
import { wakatimeSettings } from './wakatime/wakatime.schema';

/** The syncs of this section run every hour: half a day without one is too long. */
const STALE_HOURS = 12;
/** A token's expiry is asked from its service: not more often than this. */
const EXPIRY_FRESH_MS = 6 * 60 * 60 * 1000;
const NAMES = { gitlab: 'GitLab', bitbucket: 'Bitbucket' } as const;

/**
 * The connections of Development in the list of integrations: the GitHub, GitLab and Bitbucket
 * accounts with the expiry of their tokens, the repositories, WakaTime.
 */
@Injectable()
export class DevelopmentIntegrations implements OnModuleInit {
  private readonly logger = new Logger(DevelopmentIntegrations.name);
  private readonly expiries = new Map<string, { at: number; expiresAt: Date | null }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly integrations: IntegrationsService,
    private readonly github: GithubTokenService,
    private readonly tokens: AccountTokensService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'development.github',
      module: 'development',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const [profile] = await this.db
          .select()
          .from(githubProfiles)
          .where(eq(githubProfiles.userId, userId));
        const token = await this.github.token(userId);
        if (!profile && !token) {
          return [];
        }
        return [
          {
            name: 'GitHub',
            detail: profile?.login ?? null,
            lastSyncedAt: profile?.lastSyncedAt ?? null,
            error: profile?.syncError ?? null,
            expiresAt: token
              ? await this.expiry(`github:${userId}`, () => new GithubClient(token).tokenExpiry())
              : null,
          },
        ];
      },
    });

    this.integrations.register({
      id: 'development.code',
      module: 'development',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const accounts = await this.db
          .select()
          .from(codeAccounts)
          .where(eq(codeAccounts.userId, userId));
        const reports: IntegrationReport[] = [];
        for (const account of accounts) {
          reports.push({
            key: account.provider,
            name: NAMES[account.provider],
            detail: account.login,
            lastSyncedAt: account.lastSyncedAt,
            error: account.syncError,
            // Bitbucket does not tell when an API token expires.
            expiresAt:
              account.provider === 'gitlab'
                ? await this.expiry(`gitlab:${userId}`, async () => {
                    const gitlab = await this.tokens.gitlab(userId);
                    const self = await gitlab?.get<{ expires_at?: string | null }>(
                      '/personal_access_tokens/self',
                    );
                    return gitlabTokenExpiry(self?.expires_at);
                  })
                : null,
          });
        }
        return reports;
      },
    });

    this.integrations.register({
      id: 'development.repos',
      module: 'development',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const repos = await this.db
          .select({
            fullName: trackedRepos.fullName,
            lastSyncedAt: trackedRepos.lastSyncedAt,
            syncError: trackedRepos.syncError,
          })
          .from(trackedRepos)
          .where(eq(trackedRepos.userId, userId));
        if (!repos.length) {
          return [];
        }
        const failed = repos.filter((repo) => repo.syncError);
        const synced = repos.flatMap((repo) => (repo.lastSyncedAt ? [repo.lastSyncedAt] : []));
        return [
          {
            name: 'Repositories',
            detail: String(repos.length),
            // The freshest of them: one repository that fell behind is told as an error.
            lastSyncedAt: synced.length
              ? new Date(Math.max(...synced.map((date) => date.getTime())))
              : null,
            error: failed.length
              ? `${failed.length} of ${repos.length}: ${failed[0].fullName} — ${failed[0].syncError}`
              : null,
          },
        ];
      },
    });

    this.integrations.register({
      id: 'development.wakatime',
      module: 'development',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const [settings] = await this.db
          .select()
          .from(wakatimeSettings)
          .where(eq(wakatimeSettings.userId, userId));
        return settings?.username
          ? [
              {
                name: 'WakaTime',
                detail: settings.username,
                lastSyncedAt: settings.lastSyncedAt,
                error: settings.syncError,
              },
            ]
          : [];
      },
    });
  }

  /** The expiry of a token as its service tells it; a service that does not answer — unknown. */
  private async expiry(key: string, ask: () => Promise<Date | null>): Promise<Date | null> {
    const known = this.expiries.get(key);
    if (known && Date.now() - known.at < EXPIRY_FRESH_MS) {
      return known.expiresAt;
    }
    try {
      const expiresAt = await ask();
      this.expiries.set(key, { at: Date.now(), expiresAt });
      return expiresAt;
    } catch (error) {
      this.logger.warn(`Token expiry of ${key.split(':')[0]} was not read: ${String(error)}`);
      return known?.expiresAt ?? null;
    }
  }
}
