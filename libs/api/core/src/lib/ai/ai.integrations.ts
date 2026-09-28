import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiAttachment, AiChatMessage, projectInputSchema } from '@pd/contracts';
import { AchievementsService } from '../achievements/achievements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BotDocument } from '../notifications/telegram/bot-command';
import { TelegramBotService } from '../notifications/telegram/telegram-bot.service';
import { ProjectsService } from '../projects/projects.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { coreMessages } from '../i18n/core.messages';
import { UsersService } from '../users/users.service';
import { changedFields, findById, idParameters, NO_PARAMETERS } from './ai-tool';
import { AiService } from './ai.service';
import { AttachmentError, attachmentText } from './attachment-text';

/** Telegram limits a message to 4096 characters. */
const TELEGRAM_LIMIT = 4000;
/** The assistant remembers this many recent messages… */
const CONVERSATION_MESSAGES = 16;
/** …for this long after the last one; then a new conversation starts. */
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

interface Conversation {
  messages: AiChatMessage[];
  updatedAt: number;
}

const MORNING_DIGEST_PROMPT = [
  'Make my morning digest for today. Collect data with the tools:',
  'upcoming birthdays (today and this week), website status and failures,',
  'recurring payments and spending this month, open source news, diary streak.',
  'Short bullet points with emoji, only what matters; skip empty sections.',
].join(' ');

const PROJECT_FIELDS = {
  name: { type: 'string' },
  url: { type: 'string', description: 'https://…' },
  description: { type: 'string' },
} as const;

/**
 * Wires the AI into the rest of the core:
 * - core tools (projects and their changes, achievements);
 * - the bot command `/ask question`;
 * - the Telegram assistant: plain messages go to the AI, which can also change data
 *   (tools with `writes`); documents (a bank statement…) go with their text; `/new` forgets
 *   the conversation;
 * - the morning digest at 08:30 for users who enabled it.
 */
@Injectable()
export class AiIntegrations implements OnModuleInit {
  private readonly logger = new Logger(AiIntegrations.name);
  // In memory: a restart simply starts new conversations.
  private readonly conversations = new Map<string, Conversation>();

  constructor(
    private readonly ai: AiService,
    private readonly telegram: TelegramBotService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
    private readonly projects: ProjectsService,
    private readonly achievements: AchievementsService,
    private readonly users: UsersService,
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

    this.telegram.registerCommand({
      command: 'ask',
      description: { en: coreMessages('en').askDescription, ru: coreMessages('ru').askDescription },
      handler: async (user, question) => {
        const text = coreMessages(user.locale);
        if (!question) {
          return text.askUsage;
        }
        if (!(await this.ai.isConfigured(user.id))) {
          return text.askNotConfigured;
        }
        const { reply } = await this.ai.ask(user.id, [{ role: 'user', content: question }], {
          plainText: true,
        });
        return reply.slice(0, TELEGRAM_LIMIT);
      },
    });

    this.telegram.registerCommand({
      command: 'new',
      description: {
        en: coreMessages('en').newChatDescription,
        ru: coreMessages('ru').newChatDescription,
      },
      handler: async (user) => {
        this.conversations.delete(user.id);
        return coreMessages(user.locale).newChatDone;
      },
    });

    this.telegram.registerTextHandler((user, text) => this.assist(user.id, user.locale, text));
    this.telegram.registerDocumentHandler((user, document) =>
      this.assistWithDocument(user.id, user.locale, document),
    );

    this.scheduler.register({
      name: 'ai.morning-digest',
      cron: '30 8 * * *',
      handler: () => this.sendMorningDigests(),
    });
  }

  private registerProjectWriteTools(): void {
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
        const project = findById(await this.projects.list(userId), args['id'], 'Project');
        const { name, url, description } = project;
        const input = projectInputSchema.parse({ name, url, description, ...changedFields(args) });
        return this.projects.update(userId, project.id, input);
      },
    });

    const findProject = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.projects.list(userId), args['id'], 'Project');
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

  /** A document from the chat: its text goes to the assistant together with the caption. */
  private async assistWithDocument(
    userId: string,
    locale: string,
    document: BotDocument,
  ): Promise<string> {
    const messages = coreMessages(locale);
    if (!(await this.ai.isConfigured(userId))) {
      return messages.askNotConfigured;
    }
    let attachment: AiAttachment;
    try {
      attachment = await attachmentText({
        name: document.fileName,
        data: await document.download(),
      });
    } catch (error) {
      if (error instanceof AttachmentError) {
        return error.reason === 'unsupported'
          ? messages.attachmentUnsupported
          : messages.attachmentEmpty;
      }
      this.logger.warn(`Could not read a Telegram document for ${userId}: ${error}`);
      return messages.attachmentFailed;
    }
    return this.assist(userId, locale, document.caption, [attachment]);
  }

  /** One turn of the Telegram assistant, with the recent conversation as context. */
  private async assist(
    userId: string,
    locale: string,
    text: string,
    attachments?: AiAttachment[],
  ): Promise<string> {
    const messages = coreMessages(locale);
    if (!(await this.ai.isConfigured(userId))) {
      return messages.askNotConfigured;
    }
    const previous = this.conversations.get(userId);
    const history =
      previous && Date.now() - previous.updatedAt < CONVERSATION_TTL_MS ? previous.messages : [];
    // The file text stays in the conversation: a follow-up ("yes, add them") needs it.
    const conversation: AiChatMessage[] = [
      ...history,
      { role: 'user', content: text, ...(attachments && { attachments }) },
    ];
    try {
      const { reply } = await this.ai.ask(userId, conversation, {
        plainText: true,
        allowWrites: true,
      });
      this.conversations.set(userId, {
        messages: [...conversation, { role: 'assistant' as const, content: reply }].slice(
          -CONVERSATION_MESSAGES,
        ),
        updatedAt: Date.now(),
      });
      return reply.slice(0, TELEGRAM_LIMIT) || '🤷';
    } catch (error) {
      this.logger.warn(`Telegram assistant failed for ${userId}: ${error}`);
      return messages.assistantFailed;
    }
  }

  private async sendMorningDigests(): Promise<void> {
    for (const userId of await this.ai.usersWithMorningDigest()) {
      const { reply } = await this.ai.ask(
        userId,
        [{ role: 'user', content: MORNING_DIGEST_PROMPT }],
        {
          plainText: true,
        },
      );
      await this.notifications.send(userId, {
        title: coreMessages((await this.users.findById(userId))?.locale).morningDigestTitle,
        body: reply.slice(0, TELEGRAM_LIMIT),
        source: 'ai',
      });
    }
  }
}
