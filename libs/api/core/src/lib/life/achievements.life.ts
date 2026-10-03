import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { LifeCard } from '@pd/contracts';
import { and, count, eq, gte, lt } from 'drizzle-orm';
import { unlockedAchievements } from '../achievements/achievements.schema';
import { DB, Database } from '../database/database.module';
import { UsersService } from '../users/users.service';
import { LifeService, localDaysRange } from './life.service';

/** The achievements unlocked in a period, for its summary. */
@Injectable()
export class AchievementsLife implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'achievements',
      period: async (userId, period): Promise<LifeCard[]> => {
        const { start, end } = localDaysRange(
          this.users.timeZoneOf(await this.users.findById(userId)),
          period,
        );
        const [row] = await this.db
          .select({ unlocked: count() })
          .from(unlockedAchievements)
          .where(
            and(
              eq(unlockedAchievements.userId, userId),
              gte(unlockedAchievements.unlockedAt, start),
              lt(unlockedAchievements.unlockedAt, end),
            ),
          );
        return row?.unlocked
          ? [
              {
                module: 'achievements',
                icon: 'emoji_events',
                key: 'core.life.achievements',
                value: row.unlocked,
                format: 'number',
              },
            ]
          : [];
      },
    });
  }
}
