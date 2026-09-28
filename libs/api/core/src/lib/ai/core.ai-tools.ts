import { Injectable, OnModuleInit } from '@nestjs/common';
import { projectInputSchema } from '@pd/contracts';
import { AchievementsService } from '../achievements/achievements.service';
import { ProjectsService } from '../projects/projects.service';
import { changedFields, findById, idParameters, NO_PARAMETERS } from './ai-tool';
import { AiService } from './ai.service';

const PROJECT_FIELDS = {
  name: { type: 'string' },
  url: { type: 'string', description: 'https://…' },
  description: { type: 'string' },
} as const;

/** AI access to the core's own data: projects (and changing them) and achievements. */
@Injectable()
export class CoreAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly projects: ProjectsService,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'core_projects',
      module: 'projects',
      description: "The user's projects (sites and services): name, URL, description.",
      parameters: NO_PARAMETERS,
      handler: (userId) => this.projects.list(userId),
    });
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
        const { id, name, url, description } = await findProject(userId, args);
        const input = projectInputSchema.parse({ name, url, description, ...changedFields(args) });
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
