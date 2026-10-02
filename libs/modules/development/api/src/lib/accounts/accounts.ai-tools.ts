import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, ServerActions } from '@pd/api-core';
import { TOKEN_PROVIDERS, tokenProviderSchema } from '@pd/contracts';
import { z } from 'zod';
import { ACCOUNT_ACTIONS } from './accounts.server-actions';
import { AccountsService } from './accounts.service';

const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const accountSchema = z.object({ provider: tokenProviderSchema });
const periodSchema = accountSchema.extend({ from: LOCAL_DATE, to: LOCAL_DATE });

const PROVIDER = {
  type: 'string',
  enum: [...TOKEN_PROVIDERS],
  description: 'The service: gitlab or bitbucket',
} as const;

/**
 * AI access to the GitLab and Bitbucket accounts and to the summary of all services. (The GitHub
 * account has tools of its own, see github-profile.ai-tools.ts.)
 */
@Injectable()
export class AccountsAiTools implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly ai: AiService,
    private readonly accounts: AccountsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'coding_summary',
      module: 'development',
      description:
        "The user's activity on GitHub, GitLab and Bitbucket as one: contributions in total, " +
        'today and over 7 days, the current and the longest streak of days with a contribution ' +
        'on any service, the busiest day, per-year totals (commits, pull / merge requests, ' +
        'reviews, issues, and the share of each service) and a line per connected account. ' +
        '`null` — no service is connected. Use it for "how much did I code" unless one service ' +
        'is asked about.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.accounts.summary(userId),
    });

    this.ai.registerTool({
      name: 'code_account',
      module: 'development',
      description:
        "The user's own GitLab or Bitbucket account: own repositories, contributions in total, " +
        'today and over 7 days, streaks, the busiest day, per-year totals, languages, top ' +
        'repositories; on GitLab also followers and stars. `null` — the service is not connected.',
      parameters: { type: 'object', properties: { provider: PROVIDER }, required: ['provider'] },
      handler: async (userId, args) => {
        const account = await this.accounts.account(userId, accountSchema.parse(args).provider);
        return account && { ...account, followersHistory: undefined, avatarUrl: undefined };
      },
    });

    this.ai.registerTool({
      name: 'code_account_contributions',
      module: 'development',
      description:
        'GitLab or Bitbucket contributions per day for a period (only the days that have any) ' +
        'and their sum.',
      parameters: {
        type: 'object',
        properties: {
          provider: PROVIDER,
          from: { type: 'string', description: 'Start of the period, YYYY-MM-DD' },
          to: { type: 'string', description: 'End of the period, inclusive, YYYY-MM-DD' },
        },
        required: ['provider', 'from', 'to'],
      },
      handler: async (userId, args) => {
        const { provider, from, to } = periodSchema.parse(args);
        const days = await this.accounts.contributions(userId, provider, from, to);
        return { total: days.reduce((sum, day) => sum + day.count, 0), days };
      },
    });

    this.ai.registerTool({
      name: 'code_account_sync',
      module: 'development',
      writes: true,
      description:
        'Refreshes the GitLab or Bitbucket account statistics now instead of waiting for the ' +
        'hourly sync.',
      parameters: { type: 'object', properties: { provider: PROVIDER }, required: ['provider'] },
      handler: async (userId, args) => {
        const { provider } = accountSchema.parse(args);
        await this.actions.run(userId, ACCOUNT_ACTIONS.sync, { provider });
        return { refreshed: true };
      },
    });
  }
}
