import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_PROVIDER_PRESETS,
  AiChatMessage,
  AiChatResponse,
  AiProvider,
  AiSettings,
  AiSettingsInput,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { AppConfig } from '../config/env';
import { DB, Database } from '../database/database.module';
import { SecretsService } from '../secrets/secrets.service';
import { coreMessages } from '../i18n/core.messages';
import { UsersService } from '../users/users.service';
import { AiTool } from './ai-tool';
import { aiSettings } from './ai.schema';
import {
  AiRequestError,
  ChatConnection,
  chatCompletion,
  ChatMessage,
} from './openai-compatible.client';
import { runToolLoop } from './tool-loop';

const API_KEY_SECRET = 'ai.api-key';
/** Сколько раз подряд модель может запросить данные, прежде чем ответить. */
const MAX_TOOL_ROUNDS = 6;
/** Ответ инструмента обрезаем, чтобы не раздувать контекст (и счёт за токены). */
const MAX_TOOL_RESULT_CHARS = 12_000;

export interface AskOptions {
  /** Для Telegram и уведомлений: без markdown-разметки. */
  plainText?: boolean;
}

/**
 * AI-шлюз: любой OpenAI-совместимый API (DeepSeek, OpenAI, Ollama…).
 * Модули дают модели доступ к своим данным через инструменты (см. AiTool).
 *
 * Важно: при вопросе данные, которые запросит модель, уходят провайдеру AI.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly tools: AiTool[] = [];

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly secrets: SecretsService,
    private readonly users: UsersService,
  ) {}

  registerTool(tool: AiTool): void {
    this.tools.push(tool);
  }

  // --- Настройки ---

  async getSettings(userId: string): Promise<AiSettings> {
    const [row] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const preset = AI_PROVIDER_PRESETS.deepseek;
    return {
      configured: Boolean(row),
      provider: (row?.provider as AiProvider) ?? 'deepseek',
      baseUrl: row?.baseUrl ?? preset.baseUrl,
      model: row?.model ?? preset.model,
      hasApiKey: await this.secrets.has(userId, API_KEY_SECRET),
      morningDigest: row?.morningDigest ?? false,
    };
  }

  /** Сохраняет настройки и проверяет подключение коротким запросом. */
  async saveSettings(userId: string, input: AiSettingsInput): Promise<AiSettings> {
    const apiKey = input.apiKey || (await this.secrets.get(userId, API_KEY_SECRET));
    const connection = { baseUrl: input.baseUrl, model: input.model, apiKey };
    try {
      await chatCompletion(connection, [{ role: 'user', content: 'ping' }]);
    } catch (error) {
      throw new BadRequestException(
        error instanceof AiRequestError
          ? `AI API rejected the request (${error.status})`
          : 'AI API is unreachable',
      );
    }
    if (input.apiKey) {
      await this.secrets.set(userId, API_KEY_SECRET, input.apiKey);
    }
    const values = {
      provider: input.provider,
      baseUrl: input.baseUrl,
      model: input.model,
      morningDigest: input.morningDigest,
    };
    await this.db
      .insert(aiSettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: aiSettings.userId, set: values });
    return this.getSettings(userId);
  }

  async removeSettings(userId: string): Promise<void> {
    await this.db.delete(aiSettings).where(eq(aiSettings.userId, userId));
    await this.secrets.delete(userId, API_KEY_SECRET);
  }

  async isConfigured(userId: string): Promise<boolean> {
    return (await this.connectionFor(userId)) !== null;
  }

  async usersWithMorningDigest(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: aiSettings.userId })
      .from(aiSettings)
      .where(eq(aiSettings.morningDigest, true));
    return rows.map((row) => row.userId);
  }

  // --- Запросы к модели ---

  /**
   * Диалог с доступом к данным модулей: модель запрашивает инструменты,
   * мы их выполняем и возвращаем результат, пока она не даст ответ.
   */
  async ask(
    userId: string,
    history: AiChatMessage[],
    options: AskOptions = {},
  ): Promise<AiChatResponse> {
    const connection = await this.requireConnection(userId);
    const messages: ChatMessage[] = [
      { role: 'system', content: await this.systemPrompt(userId, options) },
      ...history,
    ];
    try {
      return await runToolLoop({
        messages,
        tools: this.tools,
        complete: (conversation, tools) => chatCompletion(connection, conversation, tools),
        runTool: (tool, rawArgs) => this.runTool(userId, tool, rawArgs),
        maxRounds: MAX_TOOL_ROUNDS,
      });
    } catch (error) {
      if (error instanceof AiRequestError) {
        throw new BadRequestException(`AI API error (${error.status})`);
      }
      throw error;
    }
  }

  /** Одиночный запрос без инструментов (саммари, переформулировки). */
  async complete(userId: string, instruction: string, content: string): Promise<string> {
    const connection = await this.requireConnection(userId);
    const language = coreMessages((await this.users.findById(userId))?.locale).aiLanguage;
    try {
      const reply = await chatCompletion(connection, [
        { role: 'system', content: `${instruction} Always answer in ${language}.` },
        { role: 'user', content },
      ]);
      return reply.content ?? '';
    } catch (error) {
      if (error instanceof AiRequestError) {
        throw new BadRequestException(`AI API error (${error.status})`);
      }
      throw error;
    }
  }

  private async runTool(
    userId: string,
    tool: AiTool | undefined,
    rawArgs: string,
  ): Promise<string> {
    if (!tool) {
      return JSON.stringify({ error: 'Unknown tool' });
    }
    try {
      const args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
      const result = JSON.stringify(await tool.handler(userId, args));
      return result.length > MAX_TOOL_RESULT_CHARS
        ? `${result.slice(0, MAX_TOOL_RESULT_CHARS)}… (обрезано)`
        : result;
    } catch (error) {
      this.logger.warn(`AI tool ${tool.name} failed: ${error}`);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async systemPrompt(userId: string, { plainText }: AskOptions): Promise<string> {
    const user = await this.users.findById(userId);
    const timeZone = this.config.get('APP_TIMEZONE', { infer: true });
    // Промпт на английском — модели понимают его лучше; язык ответа — из профиля пользователя.
    return [
      `You are the assistant of ${user?.displayName ?? 'the user'}'s personal dashboard.`,
      `Today is ${toLocalDate(todayIn(timeZone))}, time zone ${timeZone}.`,
      `Always answer in ${coreMessages(user?.locale).aiLanguage}, briefly and to the point.`,
      'Get any data about the user only through the tools and never make things up;',
      'if there is no data, say so. Always state currencies for amounts.',
      plainText
        ? 'Write plain text without markdown formatting; emoji are fine.'
        : 'You may use markdown (lists, bold).',
    ].join(' ');
  }

  private async requireConnection(userId: string): Promise<ChatConnection> {
    const connection = await this.connectionFor(userId);
    if (!connection) {
      throw new BadRequestException('AI is not configured');
    }
    return connection;
  }

  private async connectionFor(userId: string): Promise<ChatConnection | null> {
    const [row] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    if (!row) {
      return null;
    }
    return {
      baseUrl: row.baseUrl,
      model: row.model,
      apiKey: await this.secrets.get(userId, API_KEY_SECRET),
    };
  }
}
