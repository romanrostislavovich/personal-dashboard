import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Achievement, RARITY_XP } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { debounceTime, groupBy, mergeMap, Subscription } from 'rxjs';
import { DB, Database } from '../database/database.module';
import { coreMessages } from '../i18n/core.messages';
import { localize } from '../i18n/locale';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UserActivityService } from '../realtime/user-activity.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { AchievementMetric, AchievementTier, tierRarity } from './achievement-metric';
import { unlockedAchievements } from './achievements.schema';
import { metaAchievementMetrics } from './meta.achievements';
import { achievementId, newlyUnlockedTiers } from './newly-unlocked';

/** A burst of changes (typing with autosave, several saves) triggers one check. */
const ACTIVITY_DEBOUNCE_MS = 3_000;

/**
 * Achievements engine. Modules register metrics (see AchievementMetric); the engine checks them
 * a few seconds after the user changes something, hourly (for data synced in the background)
 * and when the page is opened, and records unlocked tiers.
 * New achievements go to Telegram (one message per check) and live to open dashboards.
 */
@Injectable()
export class AchievementsService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AchievementsService.name);
  private readonly metrics: AchievementMetric[] = [];
  private activitySubscription: Subscription | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
    private readonly realtime: RealtimeService,
    private readonly activity: UserActivityService,
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

    // One debounced check per user after their changes.
    this.activitySubscription = this.activity.activity$
      .pipe(
        groupBy((userId) => userId),
        mergeMap((userActivity) => userActivity.pipe(debounceTime(ACTIVITY_DEBOUNCE_MS))),
      )
      .subscribe((userId) => {
        this.evaluate(userId).catch((error) =>
          this.logger.warn(`Achievements check for ${userId} failed: ${error}`),
        );
      });
  }

  /** Meta achievements count other achievements, so they go after all modules have registered. */
  onApplicationBootstrap(): void {
    for (const metric of metaAchievementMetrics(this.db, () => this.metrics)) {
      this.register(metric);
    }
  }

  onModuleDestroy(): void {
    this.activitySubscription?.unsubscribe();
  }

  /** All user achievements with progress (also unlocks new ones). */
  async list(userId: string): Promise<Achievement[]> {
    const { values, unlocked } = await this.evaluate(userId);
    const locale = (await this.users.findById(userId))?.locale;

    return this.metrics.flatMap((metric) =>
      metric.tiers.map((tier, index) =>
        this.toAchievement(metric, tier, index, locale, {
          progress: values.get(metric.id) ?? 0,
          unlockedAt: unlocked.get(achievementId(metric, tier)) ?? null,
        }),
      ),
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
    const candidates: { metric: AchievementMetric; tier: AchievementTier; index: number }[] = [];

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
        candidates.push({ metric, tier, index: metric.tiers.indexOf(tier) });
      }
    }

    if (candidates.length > 0) {
      const now = new Date();
      // Two checks may run at once (page open + activity): only rows this check inserted count.
      const inserted = await this.db
        .insert(unlockedAchievements)
        .values(
          candidates.map(({ metric, tier }) => ({
            userId,
            achievementId: achievementId(metric, tier),
            unlockedAt: now,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: unlockedAchievements.achievementId });
      const insertedIds = new Set(inserted.map((row) => row.id));
      candidates.forEach(({ metric, tier }) => unlocked.set(achievementId(metric, tier), now));

      const fresh = candidates.filter(({ metric, tier }) =>
        insertedIds.has(achievementId(metric, tier)),
      );
      if (fresh.length > 0) {
        await this.announce(userId, fresh, values, now);
      }
    }

    return { values, unlocked };
  }

  /** Live event for open dashboards and one message for Telegram. */
  private async announce(
    userId: string,
    fresh: { metric: AchievementMetric; tier: AchievementTier; index: number }[],
    values: Map<string, number>,
    unlockedAt: Date,
  ): Promise<void> {
    const locale = (await this.users.findById(userId))?.locale;
    const achievements = fresh.map(({ metric, tier, index }) =>
      this.toAchievement(metric, tier, index, locale, {
        progress: values.get(metric.id) ?? tier.goal,
        unlockedAt,
      }),
    );
    this.realtime.emit(userId, { type: 'achievements', achievements });

    const text = coreMessages(locale);
    await this.notifications.send(userId, {
      title: text.achievementsTitle,
      body: achievements
        .map(
          (a) => `${a.icon} ${a.title} — ${a.description}\n${text.rarity[a.rarity]} · +${a.xp} XP`,
        )
        .join('\n\n'),
      source: 'achievements',
    });
  }

  private toAchievement(
    metric: AchievementMetric,
    tier: AchievementTier,
    index: number,
    locale: string | undefined,
    state: { progress: number; unlockedAt: Date | null },
  ): Achievement {
    const rarity = tierRarity(metric, index);
    return {
      id: achievementId(metric, tier),
      module: metric.module,
      icon: tier.icon,
      title: localize(tier.title, locale),
      description: localize(tier.description, locale),
      rarity,
      xp: RARITY_XP[rarity],
      goal: tier.goal,
      progress: Math.min(state.progress, tier.goal),
      unlockedAt: state.unlockedAt?.toISOString() ?? null,
    };
  }
}
