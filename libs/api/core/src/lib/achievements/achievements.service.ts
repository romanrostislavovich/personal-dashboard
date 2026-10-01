import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Achievement, RARITY_XP } from '@pd/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import { debounceTime, groupBy, mergeMap, Subscription } from 'rxjs';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { coreMessages } from '../i18n/core.messages';
import { localize } from '../i18n/locale';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UserActivityService } from '../realtime/user-activity.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { ServerActions } from '../sync/server-actions';
import { UsersService } from '../users/users.service';
import { AchievementMetric, AchievementTier, tierRarity } from './achievement-metric';
import { unlockedAchievements } from './achievements.schema';
import { dashboardAchievementMetrics, markActiveDay } from './dashboard.achievements';
import { metaAchievementMetrics } from './meta.achievements';
import { achievementId, newlyUnlockedTiers } from './newly-unlocked';

interface UnlockedTier {
  metric: AchievementMetric;
  tier: AchievementTier;
  index: number;
}

/** Unlocking is the server's job, and so is taking achievements back (see ServerActions). */
export const RECOUNT_ACTION = 'achievements.recount';

/** A burst of changes (typing with autosave, several saves) triggers one check. */
const ACTIVITY_DEBOUNCE_MS = 3_000;

/**
 * Achievements engine. Modules register metrics (see AchievementMetric); the engine checks them
 * a few seconds after the user changes something, hourly (for data synced in the background)
 * and when the page is opened, and records unlocked tiers.
 * New achievements go to Telegram (one message per check) and live to open dashboards.
 *
 * A sync client (SYNC_MODE=client) never unlocks anything: the server does, and unlocked
 * achievements arrive with the sync like any other data. The client only measures progress
 * over its copy of the data to show it on the page.
 */
@Injectable()
export class AchievementsService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AchievementsService.name);
  private readonly metrics: AchievementMetric[] = [];
  private activitySubscription: Subscription | null = null;
  private readonly isSyncClient: boolean;
  private readonly timeZone: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) config: AppConfig,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
    private readonly realtime: RealtimeService,
    private readonly activity: UserActivityService,
    private readonly actions: ServerActions,
  ) {
    this.isSyncClient = config.get('SYNC_MODE', { infer: true }) === 'client';
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
  }

  register(metric: AchievementMetric): void {
    this.metrics.push(metric);
  }

  onModuleInit(): void {
    this.actions.register(RECOUNT_ACTION, (userId, args) =>
      this.recount(userId, String(args['module'])),
    );
    this.scheduler.register({
      name: 'achievements.evaluate',
      cron: '40 * * * *',
      handler: async () => {
        for (const user of await this.users.findAll()) {
          await this.evaluate(user.id);
        }
      },
    });

    if (this.isSyncClient) {
      return;
    }
    // One debounced check per user after their changes (a change also makes the day active).
    this.activitySubscription = this.activity.activity$
      .pipe(
        groupBy((userId) => userId),
        mergeMap((userActivity) => userActivity.pipe(debounceTime(ACTIVITY_DEBOUNCE_MS))),
      )
      .subscribe((userId) => {
        markActiveDay(this.db, userId, this.timeZone)
          .then(() => this.evaluate(userId))
          .catch((error) => this.logger.warn(`Achievements check for ${userId} failed: ${error}`));
      });
  }

  /**
   * Dashboard achievements are shown after the modules' ones. Meta achievements count other
   * achievements, so they go after all modules have registered.
   */
  onApplicationBootstrap(): void {
    for (const metric of dashboardAchievementMetrics(this.db, this.timeZone)) {
      this.register(metric);
    }
    for (const metric of metaAchievementMetrics(this.db, () => this.metrics)) {
      this.register(metric);
    }
  }

  onModuleDestroy(): void {
    this.activitySubscription?.unsubscribe();
  }

  /**
   * All user achievements with progress (also unlocks new ones). The dashboard asks for them
   * on every open, so this is also where a visit day is recorded.
   */
  async list(userId: string): Promise<Achievement[]> {
    await markActiveDay(this.db, userId, this.timeZone);
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
    const now = new Date();

    if (this.isSyncClient) {
      // Progress only; unlocking is the server's job (see the class comment).
      await this.measure(userId, this.metrics, values);
      return { values, unlocked };
    }

    // Meta achievements go second: they count what the first pass has just unlocked.
    const fresh = [
      ...(await this.unlockPass(
        userId,
        this.metrics.filter((m) => !m.countsAchievements),
        unlocked,
        values,
        now,
      )),
      ...(await this.unlockPass(
        userId,
        this.metrics.filter((m) => m.countsAchievements),
        unlocked,
        values,
        now,
      )),
    ];
    if (fresh.length > 0) {
      await this.announce(userId, fresh, values, now);
    }

    return { values, unlocked };
  }

  /**
   * Counts a section again after its rules changed: achievements of the module whose goal is
   * above today's value are taken back (they land in the trash), then the achievements that
   * count achievements follow. An ordinary check never does this — an achievement stays even
   * when the value drops; this runs only when the user asks for it.
   */
  async recount(userId: string, module: string): Promise<void> {
    await this.takeBack(
      userId,
      this.metrics.filter((m) => m.module === module && !m.countsAchievements),
    );
    await this.takeBack(
      userId,
      this.metrics.filter((m) => m.countsAchievements),
    );
    // What is still earned (or newly earned under the new rules) is unlocked as usual.
    await this.evaluate(userId);
  }

  /** Deletes unlocked tiers the metrics no longer reach. A metric that failed is left alone. */
  private async takeBack(userId: string, metrics: AchievementMetric[]): Promise<void> {
    const values = new Map<string, number>();
    await this.measure(userId, metrics, values);
    const lost = metrics.flatMap((metric) => {
      const value = values.get(metric.id);
      return value === undefined
        ? []
        : metric.tiers
            .filter((tier) => value < tier.goal)
            .map((tier) => achievementId(metric, tier));
    });
    if (lost.length > 0) {
      await this.db
        .delete(unlockedAchievements)
        .where(
          and(
            eq(unlockedAchievements.userId, userId),
            inArray(unlockedAchievements.achievementId, lost),
          ),
        );
    }
  }

  /** Measures the metrics and saves reached tiers; returns the ones this call inserted. */
  private async unlockPass(
    userId: string,
    metrics: AchievementMetric[],
    unlocked: Map<string, Date>,
    values: Map<string, number>,
    now: Date,
  ): Promise<UnlockedTier[]> {
    await this.measure(userId, metrics, values);
    const candidates: UnlockedTier[] = [];
    for (const metric of metrics) {
      const value = values.get(metric.id);
      if (value === undefined) {
        continue;
      }
      for (const tier of newlyUnlockedTiers(metric, value, new Set(unlocked.keys()))) {
        candidates.push({ metric, tier, index: metric.tiers.indexOf(tier) });
      }
    }

    if (candidates.length === 0) {
      return [];
    }
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
    return candidates.filter(({ metric, tier }) => insertedIds.has(achievementId(metric, tier)));
  }

  /**
   * Measures the metrics into `values`. A failed metric (for example, Last.fm is down) is left
   * out and does not affect the others.
   */
  private async measure(
    userId: string,
    metrics: AchievementMetric[],
    values: Map<string, number>,
  ): Promise<void> {
    for (const metric of metrics) {
      try {
        values.set(metric.id, await metric.measure(userId));
      } catch (error) {
        this.logger.warn(`Achievement metric ${metric.id} failed: ${error}`);
      }
    }
  }

  /** Live event for open dashboards and one message for Telegram. */
  private async announce(
    userId: string,
    fresh: UnlockedTier[],
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
