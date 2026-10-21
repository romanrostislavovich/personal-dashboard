import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  aiMemoryInputSchema,
  lifeDayQuerySchema,
  beforeAfterQuerySchema,
  correlationsQuerySchema,
  moodInsightsQuerySchema,
  projectInputSchema,
  projectOverviewQuerySchema,
} from '@pd/contracts';
import { AchievementsService } from '../achievements/achievements.service';
import { LifeService } from '../life/life.service';
import { LinksService } from '../links/links.service';
import { ProjectOverviewService } from '../links/project-overview.service';
import { ProjectsService } from '../projects/projects.service';
import { changedFields, findById, idParameters, NO_PARAMETERS, PERIOD_PARAMETERS } from './ai-tool';
import { AiActionsService } from './ai-actions.service';
import { AiMemoryService } from './ai-memory.service';
import { aiMemories } from './ai.schema';
import { RecallService } from '../recall/recall.service';
import { AiService } from './ai.service';
import { projects } from '../projects/projects.schema';

const PROJECT_FIELDS = {
  name: { type: 'string' },
  url: { type: 'string', description: 'https://…' },
  description: { type: 'string' },
  aliases: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Other names of the project in the sections: its repository (owner/name), its project ' +
      'in WakaTime. Replaces the whole list.',
  },
} as const;

/** AI access to the core's own data: projects (and changing them) and achievements. */
@Injectable()
export class CoreAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
    private readonly achievements: AchievementsService,
    private readonly overviews: ProjectOverviewService,
    private readonly links: LinksService,
    private readonly life: LifeService,
    private readonly actions: AiActionsService,
    private readonly memories: AiMemoryService,
    private readonly recall: RecallService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'core_projects',
      module: 'projects',
      description:
        "The user's projects (sites and services): id, name, URL, description, aliases (its " +
        'names in the other sections). The page of one is /projects/<id>.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.projects.list(userId),
    });
    this.registerLinkTools();
    this.registerProjectWriteTools();
    this.ai.registerTool({
      name: 'core_achievements',
      module: 'achievements',
      description:
        'Personal achievements: unlocked ones (unlockedAt) and progress on the rest. Some are ' +
        'for what the sections know together: a project known to several sections, a project ' +
        'that pays for its hours, what goes with a good day, focus with music, gift ideas.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.achievements.list(userId)).map(({ title, progress, goal, unlockedAt }) => ({
          title,
          progress,
          goal,
          unlockedAt,
        })),
    });
  }

  /** What the sections know together (see LinksService). */
  private registerLinkTools(): void {
    this.ai.registerTool({
      name: 'core_project_overview',
      module: 'projects',
      description:
        'One project across every section over a period: `facts` — time at the computer on ' +
        'it, coding time from WakaTime, focus sessions, income and expenses, open and done ' +
        'tasks, uptime of its sites, its repositories (each with module, labelKey, value, unit: ' +
        'seconds / money / count / percent); `changes` — its latest commits and releases; ' +
        '`perHour` — income and expenses per hour of work. Useful for "how much time and money ' +
        'went into X", "is X worth it". Take the id from core_projects.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Project id from core_projects' },
          ...PERIOD_PARAMETERS.properties,
        },
        required: ['id', 'from', 'to'],
      },
      handler: (userId, args) =>
        this.overviews.overview(
          userId,
          String(args['id']),
          projectOverviewQuerySchema.parse({ from: args['from'], to: args['to'] }),
        ),
    });
    this.ai.registerTool({
      name: 'core_day',
      module: 'life',
      description:
        'One day across every section at once: `events` — what each section has for the day ' +
        '(hours at the computer and the main program, money spent and earned, music, tasks ' +
        'done, the diary entry and the mood, games, commits), each with its section (`module`), ' +
        'a translation key that names it (`key`), its numbers (`params`) and the page to open ' +
        '(`link`). Useful for "what did I do on the 3rd", "how was yesterday" — one call ' +
        'instead of asking every section; for the details of one section use its own tools.',
      parameters: {
        type: 'object',
        properties: { day: { type: 'string', description: 'The day, YYYY-MM-DD' } },
        required: ['day'],
      },
      // The events of a section the AI must not see stay out (switched off, or its own model).
      handler: async (userId, args) =>
        this.life.day(
          userId,
          lifeDayQuerySchema.parse({ day: args['day'] }).day,
          await this.ai.hiddenFromShared(userId),
        ),
    });
    this.ai.registerTool({
      name: 'core_project_months',
      module: 'projects',
      description:
        'One project month by month, oldest first: seconds at the computer on it, coding ' +
        'seconds from WakaTime, income and expenses with their currency. Useful for "is X ' +
        'paying off", "how did the work on X go over the half-year". Take the id from ' +
        'core_projects.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Project id from core_projects' },
          months: { type: 'number', description: '1–24, default 6' },
        },
        required: ['id'],
      },
      handler: (userId, args) =>
        this.overviews.months(
          userId,
          String(args['id']),
          Math.min(24, Math.max(1, Math.round(Number(args['months']) || 6))),
        ),
    });
    this.ai.registerTool({
      name: 'core_mood_insights',
      module: 'life',
      description:
        'What goes with good and bad days: for the days with a mood in the diary (good: 4–5, ' +
        'bad: 1–2), the average of every daily number — hours at the computer, in games, ' +
        'coding, money spent, music plays, tasks done, and readings: the temperature, the ' +
        'sun, when the computer was first and last used (`clock`: hours of the day, over 24 ' +
        '— after midnight; compare readings by `difference`, not percent) — on good days ' +
        'against bad ones, the largest difference first. `enough: false` — too few days to say. It shows what goes ' +
        'together, not the cause: say so. Use a long period (three months and more).',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.overviews.moodInsights(userId, moodInsightsQuerySchema.parse(args)),
    });
    this.ai.registerTool({
      name: 'core_correlations',
      module: 'life',
      description:
        'Links between the daily numbers of all the sections: every one against every other, ' +
        'of the same day (lag 0) and of the next day (lag 1: `a` of a day, `b` of the day ' +
        'after), by Spearman correlation `rho`, with `q` — the p-value corrected for the ' +
        'number of pairs (and for the days’ own trends). Only the strong links are returned. ' +
        '`beyondItself` (lag 1) — the correlation with yesterday’s `b` held fixed: when it ' +
        'stays strong, `a` comes before `b` and tells about it (Granger’s idea). ' +
        '`regression` — what predicts `target` (the mood by default) with the others held ' +
        'fixed: standardized `beta`, adjusted `r2`. It is still not proof of a cause: say so. ' +
        'Use a long period (three months and more).',
      parameters: {
        type: 'object',
        properties: {
          ...PERIOD_PARAMETERS.properties,
          target: {
            type: 'string',
            description: 'The key of the number to explain, e.g. diary.mood, development.coding',
          },
        },
        required: PERIOD_PARAMETERS.required,
      },
      // The numbers of a section the AI must not see stay out (switched off, or its own model).
      handler: async (userId, args) => {
        const found = await this.overviews.correlations(
          userId,
          correlationsQuerySchema.parse(args),
          await this.ai.hiddenFromShared(userId),
        );
        // The values of every day are for the page's charts, not for the model.
        return {
          from: found.from,
          to: found.to,
          metrics: found.metrics.map(({ key, label, unit, days }) => ({ key, label, unit, days })),
          links: found.correlations
            .filter((pair) => pair.strong)
            .slice(0, 40)
            .map(({ a, b, lag, rho, n, q, beyondItself, slope }) => ({
              a,
              b,
              lag,
              rho,
              n,
              q,
              beyondItself,
              slope,
            })),
          regression: found.regression,
        };
      },
    });
    this.ai.registerTool({
      name: 'core_before_after',
      module: 'life',
      description:
        'How the daily numbers of the sections changed at the dates a life may have changed at — ' +
        'the start or the end of a period of Health (any diagnosis, any medication) and the ' +
        'dated events of a life in Psychology: the average of `weeks` weeks before ' +
        'against the weeks after, with `p` — the chance of a change this large by itself, ' +
        'measured in the spread of the changes at the ordinary dates of the history (a placebo ' +
        'test: the seasons and trends are in it) — and `q` corrected ' +
        'for the number of numbers. Only the numbers that `changed` are returned. `enough: ' +
        'false` — too few days after the date yet. It is an observation, not a medical ' +
        'judgement and not proof of a cause: say so, gently; suggest discussing it with the doctor.',
      parameters: {
        type: 'object',
        properties: { weeks: { type: 'number', description: '2, 4 (default) or 8' } },
      },
      // Nothing of a section the AI must not see: Health hidden — no periods at all.
      handler: async (userId, args) => {
        const found = await this.overviews.beforeAfter(
          userId,
          beforeAfterQuerySchema.parse(args),
          await this.ai.hiddenFromShared(userId),
        );
        return {
          weeks: found.weeks,
          results: found.results.map(({ event, daysAfter, enough, changes }) => ({
            event: { title: event.title, kind: event.kind, edge: event.edge, on: event.on },
            daysAfter,
            enough,
            changed: changes
              .filter((change) => change.changed)
              .map(({ key, label, unit, before, after, difference, differencePercent, p, q }) => ({
                key,
                label,
                unit,
                before,
                after,
                difference,
                differencePercent,
                p,
                q,
              })),
          })),
        };
      },
    });
    this.links.registerPages([
      { module: 'life', path: '/life/links', description: 'links between the daily numbers' },
      { module: 'projects', path: '/projects', description: 'all projects' },
      {
        module: 'projects',
        path: '/projects/<id>',
        description: 'one project across the sections (id from core_projects)',
      },
      { module: 'life', path: '/life/summary', description: 'summary of a period, mood insights' },
      { module: 'life', path: '/life/goals', description: 'goals of the year' },
      { module: 'core', path: '/settings', description: 'settings, integrations, automations' },
    ]);
  }

  private registerProjectWriteTools(): void {
    const findProject = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.projects.list(userId), args['id'], 'Project');

    this.ai.registerTool({
      name: 'core_add_project',
      module: 'projects',
      writes: true,
      undoTables: [projects],
      description:
        'Creates a project — a site or service the user runs. Finance wallets and site ' +
        'monitoring are tied to projects.',
      parameters: { type: 'object', properties: PROJECT_FIELDS, required: ['name'] },
      handler: (userId, args) => this.projects.create(userId, projectInputSchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'core_update_project',
      module: 'projects',
      writes: true,
      undoTables: [projects],
      description: 'Changes a project: pass its id and only the fields to change (null clears).',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, ...PROJECT_FIELDS },
        required: ['id'],
      },
      handler: async (userId, args) => {
        const { id, name, url, description, aliases } = await findProject(userId, args);
        const input = projectInputSchema.parse({
          name,
          url,
          description,
          aliases,
          ...changedFields(args),
        });
        return this.projects.update(userId, id, input);
      },
    });

    this.ai.registerTool({
      name: 'core_delete_project',
      module: 'projects',
      writes: true,
      undoTables: [projects],
      confirm: findProject,
      description:
        'Deletes a project. Fails while it still has transactions or monitors — ' +
        'those have to be deleted or moved first.',
      parameters: idParameters('Project id from core_projects'),
      handler: async (userId, args) => {
        await this.projects.remove(userId, (await findProject(userId, args)).id);
      },
    });

    this.ai.registerTool({
      name: 'core_mood_forecast',
      module: 'life',
      description:
        "Today's mood forecast (1–5) from yesterday's numbers of every section, by a model " +
        "trained on the user's own days, with what pulls the mood up and down most " +
        '(`effect`: mood points for a typical difference of the number). Tell it only when ' +
        '`trusted` (it beat "like the last week"); otherwise say there is not enough to tell.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        this.overviews.moodForecast(userId, await this.ai.hiddenFromShared(userId)),
    });

    // "When did I last…": search by meaning over the user's own history.
    this.ai.registerTool({
      name: 'core_recall',
      module: 'ai',
      description:
        "Searches the user's own history by meaning — diary entries, tasks, health, life " +
        'events and more — when the question is about something in the past without exact ' +
        'words or dates ("when did I last have these symptoms", "what did I write about the ' +
        'move"). Returns the closest items with their date and a link; then answer from them, ' +
        'or read the item with its own section tool.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for, in the user words' },
          module: { type: 'string', description: 'Only in this section, e.g. diary' },
        },
        required: ['query'],
      },
      handler: async (userId, args) =>
        (await this.recall.search(userId, String(args['query'] ?? ''), {
          module: typeof args['module'] === 'string' ? args['module'] : undefined,
        })) ?? { error: 'Search by meaning is off: no AI connection makes vectors' },
    });

    // "Remember that…": a fact kept between conversations, in every prompt from then on.
    this.ai.registerTool({
      name: 'core_remember',
      module: 'ai',
      writes: true,
      undoTables: [aiMemories],
      description:
        'Remembers a fact about the user for every later conversation — only when the user ' +
        'asks you to remember something, or states a lasting preference ("I am vegetarian", ' +
        '"call me Roma"). One short sentence in the third person.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The fact, one sentence' } },
        required: ['text'],
      },
      handler: (userId, args) => this.memories.add(userId, aiMemoryInputSchema.parse(args).text),
    });
    this.ai.registerTool({
      name: 'core_forget',
      module: 'ai',
      writes: true,
      undoTables: [aiMemories],
      description: 'Forgets one remembered fact, by its id from the list in your instructions.',
      parameters: idParameters('The id of the fact'),
      handler: async (userId, args) => {
        await this.memories.remove(userId, String(args['id']));
      },
    });

    // "Undo that", "put it back": the assistant's own last change, after the user's "yes".
    const lastChange = async (userId: string) => {
      const id = await this.actions.lastUndoable(userId);
      if (!id) {
        throw new Error('There is no change of yours that can be undone');
      }
      const action = await this.actions.undoable(userId, id);
      return { id, tool: action.tool, module: action.module, at: action.createdAt.toISOString() };
    };
    this.ai.registerTool({
      name: 'core_undo_last_change',
      module: 'ai',
      writes: true,
      confirm: lastChange,
      description:
        'Undoes the last change you (the assistant) made to the data — when the user asks to ' +
        'undo it, cancel it or put it back as it was. Refuses when the data was changed again ' +
        'since.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => {
        const { id } = await lastChange(userId);
        return this.ai.undoAction(userId, id);
      },
    });
  }
}
