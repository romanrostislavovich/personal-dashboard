import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS, PERIOD_PARAMETERS, ServerActions } from '@pd/api-core';
import { z } from 'zod';
import { GITHUB_PROFILE_ACTIONS } from './github-profile.server-actions';
import { GithubProfileService } from './github-profile.service';

const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z.object({ from: LOCAL_DATE, to: LOCAL_DATE });

/** AI access to the GitHub account: the profile, the contribution calendar, a refresh (assistant). */
@Injectable()
export class GithubProfileAiTools implements OnModuleInit {
  constructor(
    private readonly actions: ServerActions,
    private readonly ai: AiService,
    private readonly profiles: GithubProfileService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'github_profile',
      module: 'development',
      description:
        "The user's own GitHub account: followers, own repositories and their stars, total " +
        'contributions, contributions today and over 7 days, current and longest streak of days, ' +
        'the busiest day, per-year totals (commits, pull requests, reviews, issues), languages by ' +
        'bytes of code, top repositories. `null` — no GitHub token yet.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        const profile = await this.profiles.profile(userId);
        // The followers chart is of no use to the model.
        return profile && { ...profile, followersHistory: undefined, avatarUrl: undefined };
      },
    });

    this.ai.registerTool({
      name: 'github_contributions',
      module: 'development',
      description:
        'GitHub contributions per day for a period (days without contributions are left out) ' +
        'and their sum. Useful for "how much did I code last week", comparing months, finding gaps.',
      parameters: PERIOD_PARAMETERS,
      handler: async (userId, args) => {
        const { from, to } = periodSchema.parse(args);
        const days = (await this.profiles.contributions(userId, from, to)).filter(
          (day) => day.count > 0,
        );
        return { total: days.reduce((sum, day) => sum + day.count, 0), days };
      },
    });

    this.ai.registerTool({
      name: 'github_profile_sync',
      module: 'development',
      writes: true,
      description:
        'Refreshes the GitHub account statistics now instead of waiting for the hourly sync.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        await this.actions.run(userId, GITHUB_PROFILE_ACTIONS.sync);
        return { refreshed: true };
      },
    });
  }
}
