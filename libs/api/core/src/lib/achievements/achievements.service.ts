import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Achievement } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { coreMessages } from '../i18n/core.messages';
import { localize } from '../i18n/locale';
import { AchievementMetric } from './achievement-metric';
import { unlockedAchievements } from './achievements.schema';
import { achievementId, newlyUnlockedTiers } from './newly-unlocked';

/**
 * Движок ачивок. Метрики регистрируют модули (см. AchievementMetric),
 * движок раз в час и при открытии страницы проверяет их и фиксирует открытые уровни.
 * Про все новые ачивки за проверку приходит одно уведомление.
 */
@Injectable()
export class AchievementsService implements OnModuleInit {
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

  /** Все ачивки пользователя с прогрессом (заодно открывает новые). */
  async list(userId: string): Promise<Achievement[]> {
    const { values, unlocked } = await this.evaluate(userId);
    const locale = (await this.users.findById(userId))?.locale;

    return this.metrics.flatMap((metric) =>
      metric.tiers.map((tier) => {
        const id = achievementId(metric, tier);
        return {
          id,
          module: metric.module,
          icon: tier.icon,
          title: localize(tier.title, locale),
          description: localize(tier.description, locale),
          goal: tier.goal,
          progress: Math.min(values.get(metric.id) ?? 0, tier.goal),
          unlockedAt: unlocked.get(id)?.toISOString() ?? null,
        };
      }),
    );
  }

  /**
   * Считает метрики и сохраняет новые ачивки. Ошибка одной метрики
   * (например, недоступен Last.fm) не мешает остальным.
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
