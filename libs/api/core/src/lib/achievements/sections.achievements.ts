import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { addDays, parseLocalDate, toLocalDate, todayIn } from '@pd/contracts';
import { and, count, eq, isNotNull, sum } from 'drizzle-orm';
import { aiActions, aiConversations } from '../ai/ai.schema';
import { TwoFactorService } from '../auth/two-factor.service';
import { automationRules } from '../automations/automations.schema';
import { DB, Database } from '../database/database.module';
import { LifeService } from '../life/life.service';
import { securityFindings } from '../security/security.schema';
import { UsersService } from '../users/users.service';
import { achievementTiers } from './achievement-metric';
import { AchievementsService } from './achievements.service';

/** How many sections tell about one day for it to be a full day. */
const FULL_DAY_SECTIONS = [5, 7];

/**
 * Achievements of the sections the core keeps itself: Life (a day that many sections tell
 * about), the assistant, the automations and the security of the account. Grouped
 * on the page under the web module of each (`life`, `ai`, `security`; the automations under
 * `dashboard`, where their other achievement is).
 */
@Injectable()
export class SectionsAchievements implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly life: LifeService,
    private readonly users: UsersService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  onModuleInit(): void {
    this.registerLife();
    this.registerAssistant();
    this.registerSecurity();
  }

  private registerLife(): void {
    this.achievements.register({
      id: 'life.full-day',
      module: 'life',
      measure: (userId) => this.fullestDay(userId),
      tiers: achievementTiers(
        [
          FULL_DAY_SECTIONS[0],
          '🌈',
          { en: 'A full day', ru: 'Насыщенный день' },
          {
            en: '5 sections tell about one day: the diary, tasks, money, music, code…',
            ru: 'О дне рассказывают 5 разделов: дневник, задачи, деньги, музыка, код…',
          },
        ],
        [
          FULL_DAY_SECTIONS[1],
          '🎆',
          { en: 'A day to remember', ru: 'День, который запомнится' },
          { en: '7 sections tell about one day', ru: 'О дне рассказывают 7 разделов' },
        ],
      ),
    });
  }

  private registerAssistant(): void {
    this.achievements.register({
      id: 'ai.conversations',
      module: 'ai',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: count() })
          .from(aiConversations)
          .where(eq(aiConversations.userId, userId));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          10,
          '💬',
          { en: 'Talking it over', ru: 'Обсудим' },
          { en: '10 conversations with the assistant', ru: '10 разговоров с ассистентом' },
        ],
        [
          100,
          '🤝',
          { en: 'A good partner', ru: 'Надёжный напарник' },
          { en: '100 conversations with the assistant', ru: '100 разговоров с ассистентом' },
        ],
      ),
    });

    this.achievements.register({
      id: 'ai.actions',
      module: 'ai',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: count() })
          .from(aiActions)
          .where(and(eq(aiActions.userId, userId), eq(aiActions.outcome, 'done')));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          10,
          '🪄',
          { en: 'Done for me', ru: 'Сделано за меня' },
          {
            en: 'The assistant did 10 things for you: a task, an expense, an entry…',
            ru: 'Ассистент сделал за тебя 10 дел: задачу, расход, запись…',
          },
        ],
        [
          100,
          '🦾',
          { en: 'Right hand', ru: 'Правая рука' },
          { en: 'The assistant did 100 things for you', ru: 'Ассистент сделал за тебя 100 дел' },
        ],
      ),
    });

    this.achievements.register({
      id: 'dashboard.automations-fired',
      // Next to "a rule that links two sections" (links.achievements.ts).
      module: 'dashboard',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: sum(automationRules.fireCount).mapWith(Number) })
          .from(automationRules)
          .where(eq(automationRules.userId, userId));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          10,
          '⚙️',
          { en: 'It runs by itself', ru: 'Работает само' },
          { en: 'Automations ran 10 times', ru: 'Автоматизации сработали 10 раз' },
        ],
        [
          100,
          '🏭',
          { en: 'A small factory', ru: 'Маленький завод' },
          { en: 'Automations ran 100 times', ru: 'Автоматизации сработали 100 раз' },
        ],
        [
          1000,
          '🤖',
          { en: 'Autopilot', ru: 'Автопилот' },
          { en: 'Automations ran 1,000 times', ru: 'Автоматизации сработали 1 000 раз' },
        ],
      ),
    });
  }

  private registerSecurity(): void {
    this.achievements.register({
      id: 'security.two-factor',
      module: 'security',
      measure: async (userId) => Number(await this.twoFactor.isEnabled(userId)),
      tiers: achievementTiers([
        1,
        '🔐',
        { en: 'Double lock', ru: 'Двойной замок' },
        { en: 'Two-factor sign-in is on', ru: 'Включён двухфакторный вход' },
      ]),
    });

    this.achievements.register({
      id: 'security.findings-resolved',
      module: 'security',
      measure: async (userId) => {
        const [row] = await this.db
          .select({ value: count() })
          .from(securityFindings)
          .where(and(eq(securityFindings.userId, userId), eq(securityFindings.status, 'resolved')));
        return row?.value ?? 0;
      },
      tiers: achievementTiers(
        [
          1,
          '🩹',
          { en: 'Patched', ru: 'Залатано' },
          {
            en: 'A finding of the security agent fixed',
            ru: 'Исправлена находка агента безопасности',
          },
        ],
        [
          10,
          '🛡️',
          { en: 'Hardened', ru: 'Неприступно' },
          {
            en: '10 findings of the security agent fixed',
            ru: 'Исправлено 10 находок агента безопасности',
          },
        ],
      ),
    });
  }

  /**
   * The most sections in the Life feed of today or yesterday. Only those two days are looked
   * at — every check would otherwise ask every module about every day; an unlocked achievement
   * stays, so a full day counts as soon as it is had.
   */
  private async fullestDay(userId: string): Promise<number> {
    const today = toLocalDate(todayIn(this.users.timeZoneOf(await this.users.findById(userId))));
    const yesterday = toLocalDate(addDays(parseLocalDate(today), -1));
    // The weather is in every day's feed: it tells nothing about how full the day was.
    const days = await Promise.all(
      [today, yesterday].map((day) => this.life.day(userId, day, ['weather'])),
    );
    return Math.max(...days.map((day) => new Set(day.events.map((event) => event.module)).size));
  }
}
