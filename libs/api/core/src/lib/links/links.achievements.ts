import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { addDays, parseLocalDate, ProjectOverview, toLocalDate, todayIn } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { achievementTiers } from '../achievements/achievement-metric';
import { AchievementsService } from '../achievements/achievements.service';
import { automationRules } from '../automations/automations.schema';
import { DB, Database } from '../database/database.module';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { Period } from './links.service';
import { ProjectOverviewService } from './project-overview.service';

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
  return new Set(overview.facts.map((fact) => fact.module)).size;
}

/** A project that has brought more than it cost over at least ten hours of work. */
export function paysOff(overview: Pick<ProjectOverview, 'facts' | 'perHour'>): boolean {
  const seconds = Math.max(
    0,
    ...overview.facts
      .filter((fact) => fact.metric === 'seconds' || fact.metric === 'codingSeconds')
      .map((fact) => fact.value),
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
  private readonly fresh = new Map<string, { at: number; overviews: Promise<ProjectOverview[]> }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly achievements: AchievementsService,
    private readonly projects: ProjectsService,
    private readonly overviews: ProjectOverviewService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'dashboard.project-sections',
      module: MODULE,
      measure: async (userId) => Math.max(0, ...(await this.projectsOf(userId)).map(sectionsOf)),
      tiers: achievementTiers(
        [
          3,
          '🧩',
          { en: 'Pieces together', ru: 'Пазл складывается' },
          {
            en: 'Three sections know one project: its time, its money, its tasks, its sites or its code',
            ru: 'Об одном проекте знают три раздела: его время, деньги, задачи, сайты или код',
          },
        ],
        [
          5,
          '🗺️',
          { en: 'The whole picture', ru: 'Вся картина' },
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
      measure: async (userId) => (await this.projectsOf(userId)).filter(paysOff).length,
      tiers: achievementTiers([
        1,
        '💸',
        { en: 'Worth the hours', ru: 'Стоит своих часов' },
        {
          en: 'A project brought more than it cost over ten or more hours of work in three months',
          ru: 'Проект принёс больше, чем стоил, за десять и больше часов работы за три месяца',
        },
      ]),
    });

    this.achievements.register({
      id: 'dashboard.mood-insights',
      module: MODULE,
      measure: async (userId) =>
        (await this.overviews.moodInsights(userId, await this.last(userId, MOOD_DAYS))).insights
          .length,
      tiers: achievementTiers(
        [
          1,
          '🔍',
          { en: 'Know thyself', ru: 'Познай себя' },
          {
            en: 'Enough days with a mood to see what goes with a good day and what with a bad one',
            ru: 'Достаточно дней с настроением, чтобы увидеть, что сопутствует хорошему дню, а что плохому',
          },
        ],
        [
          5,
          '🧭',
          { en: 'Patterns of a life', ru: 'Закономерности жизни' },
          {
            en: 'Five things differ between your good and bad days',
            ru: 'Пять вещей отличают ваши хорошие дни от плохих',
          },
        ],
      ),
    });

    this.achievements.register({
      id: 'dashboard.automations',
      module: MODULE,
      measure: (userId) => this.db.$count(automationRules, eq(automationRules.userId, userId)),
      tiers: achievementTiers(
        [
          1,
          '🤖',
          { en: 'If this, then that', ru: 'Если это, то то' },
          {
            en: 'A rule that joins two sections: something happens in one, another acts',
            ru: 'Правило, которое связывает два раздела: в одном что-то происходит — другой действует',
          },
        ],
        [
          5,
          '🕸️',
          { en: 'It runs itself', ru: 'Работает само' },
          { en: 'Five automation rules', ru: 'Пять правил автоматизации' },
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
      for (const project of (await this.projects.list(userId)).slice(0, MAX_PROJECTS)) {
        found.push(await this.overviews.overview(userId, project.id, period));
      }
      return found;
    })();
    this.fresh.set(userId, { at: Date.now(), overviews });
    // A failed reading is not kept: the next metric asks again.
    overviews.catch(() => this.fresh.delete(userId));
    return overviews;
  }

  private async last(userId: string, days: number): Promise<Period> {
    const today = todayIn(this.users.timeZoneOf(await this.users.findById(userId)));
    return {
      from: toLocalDate(addDays(parseLocalDate(toLocalDate(today)), -days)),
      to: toLocalDate(today),
    };
  }
}
