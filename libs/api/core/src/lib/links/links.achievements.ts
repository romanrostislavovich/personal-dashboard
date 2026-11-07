import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {
  addDays,
  parseLocalDate,
  ProjectOverview,
  toLocalDate,
  todayIn,
} from '@pd/contracts';
import {eq} from 'drizzle-orm';
import {achievementTiers} from '../achievements/achievement-metric';
import {AchievementsService} from '../achievements/achievements.service';
import {automationRules} from '../automations/automations.schema';
import {DB, Database} from '../database/database.module';
import {ProjectsService} from '../projects/projects.service';
import {UsersService} from '../users/users.service';
import {Period} from './links.service';
import {ProjectOverviewService} from './project-overview.service';
import {ChangePointsService, EVEN_DAY} from './change-points.service';
import {ForecastsService} from './forecasts.service';

/** Shown under "Home" on the achievements page, with the others about the dashboard itself. */
const MODULE = 'dashboard';
/** A project is looked at over this long. */
const PROJECT_DAYS = 90;
/** The mood is compared over this long. */
const MOOD_DAYS = 180;
/** Projects looked at: each is a question to every section. */
const MAX_PROJECTS = 20;
/** One check measures several metrics of the projects: they share the answer. */
const FRESH_MS = 60_000;
const HOUR = 3600;

/** How many sections know something about a project. */
export function sectionsOf(overview: Pick<ProjectOverview, 'facts'>): number {
  return new Set(overview.facts.map(fact => fact.module)).size;
}

/** A project that has brought more than it cost over at least ten hours of work. */
export function paysOff(
  overview: Pick<ProjectOverview, 'facts' | 'perHour'>,
): boolean {
  const seconds = Math.max(
    0,
    ...overview.facts
      .filter(
        fact => fact.metric === 'seconds' || fact.metric === 'codingSeconds',
      )
      .map(fact => fact.value),
  );
  const rate = overview.perHour;
  return seconds >= 10 * HOUR && rate !== null && rate.income > rate.expense;
}

/**
 * Achievements for what the sections know together (see LinksService): a project seen from
 * several sides, a project that pays for its hours, what goes with a good day, the rules that
 * join the sections.
 */
@Injectable()
export class LinksAchievements implements OnModuleInit {
  private readonly fresh = new Map<
    string,
    {at: number; overviews: Promise<ProjectOverview[]>}
  >();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly projects: ProjectsService,
    private readonly overviews: ProjectOverviewService,
    private readonly users: UsersService,
    private readonly changes: ChangePointsService,
    private readonly forecasts: ForecastsService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'dashboard.project-sections',
      module: MODULE,
      measure: async userId =>
        Math.max(0, ...(await this.projectsOf(userId)).map(sectionsOf)),
      tiers: achievementTiers(
        [
          3,
          '🧩',
          {en: 'Pieces together', ru: 'Пазл складывается'},
          {
            en: 'Three sections know one project: its time, its money, its tasks, its sites or its code',
            ru: 'Об одном проекте знают три раздела: его время, деньги, задачи, сайты или код',
          },
        ],
        [
          5,
          '🗺️',
          {en: 'The whole picture', ru: 'Вся картина'},
          {
            en: 'Five sections know one project over the last three months',
            ru: 'Об одном проекте знают пять разделов за последние три месяца',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'dashboard.project-pays',
      module: MODULE,
      measure: async userId =>
        (await this.projectsOf(userId)).filter(paysOff).length,
      tiers: achievementTiers([
        1,
        '💸',
        {en: 'Worth the hours', ru: 'Стоит своих часов'},
        {
          en: 'A project brought more than it cost over ten or more hours of work in three months',
          ru: 'Проект принёс больше, чем стоил, за десять и больше часов работы за три месяца',
        },
      ]),
    });

    this.achievements.register({
      id: 'dashboard.mood-insights',
      module: MODULE,
      measure: async userId =>
        (
          await this.overviews.moodInsights(
            userId,
            await this.last(userId, MOOD_DAYS),
          )
        ).insights.length,
      tiers: achievementTiers(
        [
          1,
          '🔍',
          {en: 'Know thyself', ru: 'Познай себя'},
          {
            en: 'Enough days with a mood to see what goes with a good day and what with a bad one',
            ru: 'Достаточно дней с настроением, чтобы увидеть, что сопутствует хорошему дню, а что плохому',
          },
        ],
        [
          5,
          '🧭',
          {en: 'Patterns of a life', ru: 'Закономерности жизни'},
          {
            en: 'Five things differ between your good and bad days',
            ru: 'Пять вещей отличают ваши хорошие дни от плохих',
          },
        ],
      ),
    });

    // Links v2, stage 2: for exploring one's own numbers, never for the numbers themselves.
    this.achievements.register({
      id: 'dashboard.changes-explored',
      module: MODULE,
      measure: userId => this.changes.seenCount(userId, 'change'),
      tiers: achievementTiers(
        [
          1,
          '📈',
          {en: 'Turning point', ru: 'Точка перелома'},
          {
            en: 'Look at a day a number of yours changed its level (Links → What changed)',
            ru: 'Посмотреть день, когда одно из ваших чисел сменило уровень (Links → Что менялось)',
          },
        ],
        [
          10,
          '🗺️',
          {en: 'Chronicler', ru: 'Летописец'},
          {en: 'Look at ten changes', ru: 'Посмотреть десять переломов'},
        ],
        [
          50,
          '📜',
          {en: 'Historian of oneself', ru: 'Историк самого себя'},
          {en: 'Look at fifty changes', ru: 'Посмотреть пятьдесят переломов'},
        ],
      ),
    });

    this.achievements.register({
      id: 'dashboard.doses-explored',
      module: MODULE,
      measure: userId => this.changes.seenCount(userId, 'dose'),
      tiers: achievementTiers(
        [
          1,
          '⚖️',
          {en: 'How much is enough', ru: 'Сколько — в самый раз'},
          {
            en: 'Open how one number goes with another, group by group (Links → a pair)',
            ru: 'Открыть, как одно число идёт с другим по группам (Links → пара)',
          },
        ],
        [
          10,
          '🧪',
          {en: 'Measured dose', ru: 'Выверенная доза'},
          {en: 'Open ten pairs this way', ru: 'Открыть так десять пар'},
        ],
        [
          50,
          '🔬',
          {en: 'Own laboratory', ru: 'Своя лаборатория'},
          {en: 'Open fifty pairs this way', ru: 'Открыть так пятьдесят пар'},
        ],
      ),
    });

    this.achievements.register({
      id: 'dashboard.even-days',
      module: MODULE,
      measure: userId => this.changes.seenCount(userId, EVEN_DAY),
      tiers: achievementTiers(
        [
          1,
          '🌤️',
          {en: 'An even day', ru: 'Ровный день'},
          {
            en: 'A day with none of your numbers far from usual',
            ru: 'День, когда ни одно из ваших чисел не ушло далеко от обычного',
          },
        ],
        [
          10,
          '🍃',
          {en: 'Steady pace', ru: 'Ровный ход'},
          {en: 'Ten even days', ru: 'Десять ровных дней'},
        ],
        [
          50,
          '⛰️',
          {en: 'Calm waters', ru: 'Тихая вода'},
          {en: 'Fifty even days', ru: 'Пятьдесят ровных дней'},
        ],
      ),
    });

    // Links v2, forecasts: for looking into them, never for what they say.
    this.achievements.register({
      id: 'dashboard.forecasts-explored',
      module: MODULE,
      measure: userId => this.changes.seenCount(userId, 'forecast'),
      tiers: achievementTiers(
        [
          1,
          '🔮',
          {en: 'Why so?', ru: 'Почему так?'},
          {
            en: 'Open what drove a forecast of one of your numbers (Links → Forecasts)',
            ru: 'Открыть, что повлияло на прогноз одного из ваших чисел (Links → Прогнозы)',
          },
        ],
        [
          10,
          '🌦️',
          {en: 'Weather of oneself', ru: 'Своя погода'},
          {
            en: 'Open ten forecasts this way',
            ru: 'Открыть так десять прогнозов',
          },
        ],
        [
          50,
          '🛰️',
          {en: 'Own forecaster', ru: 'Свой синоптик'},
          {
            en: 'Open fifty forecasts this way',
            ru: 'Открыть так пятьдесят прогнозов',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'dashboard.forecast-targets',
      module: MODULE,
      measure: userId => this.forecasts.chosenCount(userId),
      tiers: achievementTiers([
        1,
        '🎯',
        {en: 'A forecast of my own', ru: 'Свой прогноз'},
        {
          en: 'Choose a number of yours to forecast beyond the default ones',
          ru: 'Выбрать для прогноза своё число сверх обычных',
        },
      ]),
    });

    this.achievements.register({
      id: 'dashboard.automations',
      module: MODULE,
      measure: userId =>
        this.db.$count(automationRules, eq(automationRules.userId, userId)),
      tiers: achievementTiers(
        [
          1,
          '🤖',
          {en: 'If this, then that', ru: 'Если это, то то'},
          {
            en: 'A rule that joins two sections: something happens in one, another acts',
            ru: 'Правило, которое связывает два раздела: в одном что-то происходит — другой действует',
          },
        ],
        [
          5,
          '🕸️',
          {en: 'A web of rules', ru: 'Паутина правил'},
          {en: 'Five automation rules', ru: 'Пять правил автоматизации'},
        ],
      ),
    });
  }

  /** The user's projects across the sections over the last three months. */
  private projectsOf(userId: string): Promise<ProjectOverview[]> {
    const known = this.fresh.get(userId);
    if (known && Date.now() - known.at < FRESH_MS) {
      return known.overviews;
    }
    const overviews = (async () => {
      const period = await this.last(userId, PROJECT_DAYS);
      const found: ProjectOverview[] = [];
      for (const project of (await this.projects.list(userId)).slice(
        0,
        MAX_PROJECTS,
      )) {
        found.push(await this.overviews.overview(userId, project.id, period));
      }
      return found;
    })();
    this.fresh.set(userId, {at: Date.now(), overviews});
    // A failed reading is not kept: the next metric asks again.
    overviews.catch(() => this.fresh.delete(userId));
    return overviews;
  }

  private async last(userId: string, days: number): Promise<Period> {
    const today = todayIn(
      this.users.timeZoneOf(await this.users.findById(userId)),
    );
    return {
      from: toLocalDate(addDays(parseLocalDate(toLocalDate(today)), -days)),
      to: toLocalDate(today),
    };
  }
}
