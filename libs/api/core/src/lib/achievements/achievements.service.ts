import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { Achievement, RARITY_XP } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { coreMessages } from '../i18n/core.messages';
import { localize } from '../i18n/locale';
import { AchievementMetric, tierRarity } from './achievement-metric';
import { metaAchievementMetrics } from './meta.achievements';
import { unlockedAchievements } from './achievements.schema';
import { achievementId, newlyUnlockedTiers } from './newly-unlocked';

/**
 * Achievements engine. Modules register metrics (see AchievementMetric);
 * the engine checks them hourly and when the page is opened, and records unlocked tiers.
 * All new achievements from one check come in a single notification.
 */
@Injectable()
export class AchievementsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(AchievementsService.name);
  private readonly metrics: AchievementMetric[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
  ) {}

  register(metric: AchievementMetric): void {
    this.metrics.push(metric);
  }

  onModuleInit(): void {
    this.scheduler.register({
      name: 'achievements.evaluate',
      cron: '40 * * * *',
      handler: async () => {
        for (const user of await this.users.findAll()) {
          await this.evaluate(user.id);
        }
      },
    });
  }

  /** Meta achievements count other achievements, so they go after all modules have registered. */
  onApplicationBootstrap(): void {
    for (const metric of metaAchievementMetrics(this.db, () => this.metrics)) {
      this.register(metric);
    }
  }

  /** All user achievements with progress (also unlocks new ones). */
  async list(userId: string): Promise<Achievement[]> {
    const { values, unlocked } = await this.evaluate(userId);
    const locale = (await this.users.findById(userId))?.locale;

    return this.metrics.flatMap((metric) =>
      metric.tiers.map((tier, index) => {
        const id = achievementId(metric, tier);
        const rarity = tierRarity(metric, index);
        return {
          id,
          module: metric.module,
          icon: tier.icon,
          title: localize(tier.title, locale),
          description: localize(tier.description, locale),
          rarity,
          xp: RARITY_XP[rarity],
          goal: tier.goal,
          progress: Math.min(values.get(metric.id) ?? 0, tier.goal),
          unlockedAt: unlocked.get(id)?.toISOString() ?? null,
        };
      }),
    );
  }

  /**
   * Evaluates metrics and saves new achievements. A failure in one metric
   * (for example, Last.fm is down) does not affect the others.
   */
  async evaluate(userId: string) {
    const rows = await this.db
      .select()
      .from(unlockedAchievements)
      .where(eq(unlockedAchievements.userId, userId));
    const unlocked = new Map(rows.map((row) => [row.achievementId, row.unlockedAt]));
    const values = new Map<string, number>();
    const fresh: { id: string; title: string }[] = [];
    const locale = (await this.users.findById(userId))?.locale;

    for (const metric of this.metrics) {
      let value: number;
      try {
        value = await metric.measure(userId);
      } catch (error) {
        this.logger.warn(`Achievement metric ${metric.id} failed: ${error}`);
        continue;
      }
      values.set(metric.id, value);
      for (const tier of newlyUnlockedTiers(metric, value, new Set(unlocked.keys()))) {
        const id = achievementId(metric, tier);
        fresh.push({ id, title: `${tier.icon} ${localize(tier.title, locale)}` });
      }
    }

    if (fresh.length > 0) {
      const now = new Date();
      await this.db
        .insert(unlockedAchievements)
        .values(fresh.map(({ id }) => ({ userId, achievementId: id, unlockedAt: now })))
        .onConflictDoNothing();
      fresh.forEach(({ id }) => unlocked.set(id, now));
      await this.notifications.send(userId, {
        title: coreMessages(locale).achievementsTitle,
        body: fresh.map((a) => a.title).join('\n'),
        source: 'achievements',
      });
    }

    return { values, unlocked };
  }
}
