import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiAttachment } from '@pd/contracts';
import { coreMessages } from '../i18n/core.messages';
import { BotDocument } from '../notifications/telegram/bot-command';
import { TelegramBotService } from '../notifications/telegram/telegram-bot.service';
import { UserRow } from '../users/users.schema';
import { AiConnectionsService } from './ai-connections.service';
import { AiConversationsService } from './ai-conversations.service';
import { AiService } from './ai.service';
import { AttachmentError, attachmentText } from './attachment-text';

/** Telegram limits a message to 4096 characters. */
const TELEGRAM_LIMIT = 4000;

/**
 * The AI in Telegram:
 * - plain messages go to the assistant, which can change data (tools with `writes`); documents
 *   (a bank statement…) go with their text. The conversation is stored and shared with the
 *   web chat (see AiConversationsService), so it survives restarts;
 * - `/ask question` — a one-off question, `/new` — start a new conversation,
 *   `/model` — list the saved AI connections and switch the active one.
 */
@Injectable()
export class AiTelegramAssistant implements OnModuleInit {
  private readonly logger = new Logger(AiTelegramAssistant.name);

  constructor(
    private readonly ai: AiService,
    private readonly connections: AiConnectionsService,
    private readonly conversations: AiConversationsService,
    private readonly telegram: TelegramBotService,
  ) {}

  onModuleInit(): void {
    const both = (key: 'askDescription' | 'newChatDescription' | 'modelDescription') => ({
      en: coreMessages('en')[key],
      ru: coreMessages('ru')[key],
    });
    this.telegram.registerCommand({
      command: 'ask',
      description: both('askDescription'),
      handler: (user, question) => this.askOnce(user, question),
    });
    this.telegram.registerCommand({
      command: 'new',
      description: both('newChatDescription'),
      handler: async (user) => {
        await this.conversations.start(user.id);
        return coreMessages(user.locale).newChatDone;
      },
    });
    this.telegram.registerCommand({
      command: 'model',
      description: both('modelDescription'),
      handler: (user, args) => this.switchModel(user, args),
    });
    this.telegram.registerTextHandler((user, text) => this.assist(user, text));
    this.telegram.registerDocumentHandler((user, document) =>
      this.assistWithDocument(user, document),
    );
  }

  private async askOnce(user: UserRow, question: string): Promise<string> {
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
  }

  /** `/model` lists the connections, `/model 2` makes the second one active. */
  private async switchModel(user: UserRow, args: string): Promise<string> {
    const text = coreMessages(user.locale);
    const { connections: list, activeConnectionId } = await this.connections.settings(user.id);
    if (list.length === 0) {
      return text.askNotConfigured;
    }
    if (!args) {
      return text.modelList(
        list.map(
          (c, i) => `${i + 1}. ${c.name} · ${c.model}${c.id === activeConnectionId ? ' ✅' : ''}`,
        ),
      );
    }
    const chosen = list[Number(args) - 1];
    if (!chosen) {
      return text.modelUsage;
    }
    await this.connections.activate(user.id, chosen.id);
    return text.modelSwitched(chosen.name, chosen.model);
  }

  /** A document from the chat: its text goes to the assistant together with the caption. */
  private async assistWithDocument(user: UserRow, document: BotDocument): Promise<string> {
    const messages = coreMessages(user.locale);
    if (!(await this.ai.isConfigured(user.id))) {
      return messages.askNotConfigured;
    }
    try {
      const attachment = await attachmentText({
        name: document.fileName,
        data: await document.download(),
      });
      return await this.assist(user, document.caption, [attachment]);
    } catch (error) {
      if (error instanceof AttachmentError) {
        return error.reason === 'unsupported'
          ? messages.attachmentUnsupported
          : messages.attachmentEmpty;
      }
      this.logger.warn(`Could not read a Telegram document for ${user.id}: ${error}`);
      return messages.attachmentFailed;
    }
  }

  /** One turn of the assistant in the current conversation (shared with the web chat). */
  private async assist(user: UserRow, text: string, attachments?: AiAttachment[]): Promise<string> {
    const messages = coreMessages(user.locale);
    if (!(await this.ai.isConfigured(user.id))) {
      return messages.askNotConfigured;
    }
    try {
      // The file text is saved with the message: a follow-up ("yes, add them") needs it.
      const { reply } = await this.conversations.ask(
        user.id,
        { content: text, attachments },
        { plainText: true, allowWrites: true },
      );
      return reply.slice(0, TELEGRAM_LIMIT) || '🤷';
    } catch (error) {
      this.logger.warn(`Telegram assistant failed for ${user.id}: ${error}`);
      return messages.assistantFailed;
    }
  }
}
