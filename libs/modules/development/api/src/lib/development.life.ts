import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LifeService } from '@pd/api-core';
import { LifeCard, LifeEvent } from '@pd/contracts';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { codeAccountDays } from './accounts/accounts.schema';
import { githubContributionDays } from './github-profile/github-profile.schema';

/** Contributions (GitHub, GitLab, Bitbucket together) of a day and of a period. */
@Injectable()
export class DevelopmentLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'development',
      day: async (userId, day): Promise<LifeEvent[]> => {
        const contributions = await this.contributions(userId, { from: day, to: day });
        return contributions
          ? [
              {
                module: 'development',
                icon: 'code',
                key: 'development.life.day',
                params: { count: contributions },
                at: null,
                link: '/development',
              },
            ]
          : [];
      },
      period: async (userId, period): Promise<LifeCard[]> => {
        const contributions = await this.contributions(userId, period);
        return contributions
          ? [
              {
                module: 'development',
                icon: 'code',
                key: 'development.life.total',
                value: contributions,
                format: 'number',
              },
            ]
          : [];
      },
    });
  }

  private async contributions(
    userId: string,
    period: { from: string; to: string },
  ): Promise<number> {
    const [github] = await this.db
      .select({ total: sql<number>`coalesce(sum(${githubContributionDays.count}), 0)::int` })
      .from(githubContributionDays)
      .where(
        and(
          eq(githubContributionDays.userId, userId),
          gte(githubContributionDays.day, period.from),
          lte(githubContributionDays.day, period.to),
        ),
      );
    const [others] = await this.db
      .select({ total: sql<number>`coalesce(sum(${codeAccountDays.count}), 0)::int` })
      .from(codeAccountDays)
      .where(
        and(
          eq(codeAccountDays.userId, userId),
          gte(codeAccountDays.day, period.from),
          lte(codeAccountDays.day, period.to),
        ),
      );
    return (github?.total ?? 0) + (others?.total ?? 0);
  }
}
