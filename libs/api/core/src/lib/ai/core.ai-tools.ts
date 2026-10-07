import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  moodInsightsQuerySchema,
  projectInputSchema,
  projectOverviewQuerySchema,
} from '@pd/contracts';
import { AchievementsService } from '../achievements/achievements.service';
import { LinksService } from '../links/links.service';
import { ProjectOverviewService } from '../links/project-overview.service';
import { ProjectsService } from '../projects/projects.service';
import { changedFields, findById, idParameters, NO_PARAMETERS, PERIOD_PARAMETERS } from './ai-tool';
import { AiService } from './ai.service';

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
      description: 'Personal achievements: unlocked ones (unlockedAt) and progress on the rest.',
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
      name: 'core_mood_insights',
      module: 'life',
      description:
        'What goes with good and bad days: for the days with a mood in the diary (good: 4–5, ' +
        'bad: 1–2), the average of every daily number — hours at the computer, in games, ' +
        'coding, money spent, music plays, tasks done — on good days against bad ones, the ' +
        'largest difference first. `enough: false` — too few days to say. It shows what goes ' +
        'together, not the cause: say so. Use a long period (three months and more).',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.overviews.moodInsights(userId, moodInsightsQuerySchema.parse(args)),
    });
    this.links.registerPages([
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
      confirm: findProject,
      description:
        'Deletes a project. Fails while it still has transactions or monitors — ' +
        'those have to be deleted or moved first.',
      parameters: idParameters('Project id from core_projects'),
      handler: async (userId, args) => {
        await this.projects.remove(userId, (await findProject(userId, args)).id);
      },
    });
  }
}
