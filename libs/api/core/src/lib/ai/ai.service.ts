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
import { claimsChange, FAKE_CHANGE_CORRECTION } from './claims-change';
import { aiSettings } from './ai.schema';
import {
  AiRequestError,
  ChatConnection,
  chatCompletion,
  ChatMessage,
} from './openai-compatible.client';
import { runToolLoop } from './tool-loop';

const API_KEY_SECRET = 'ai.api-key';
/** How many times in a row the model may request data before answering. */
const MAX_TOOL_ROUNDS = 6;
/** Tool output is truncated so it does not bloat the context (and the token bill). */
const MAX_TOOL_RESULT_CHARS = 12_000;

/** How the model should behave when it can change data. */
const WRITE_RULES = [
  'You can also change data with tools (add birthdays, diary notes, transactions and so on).',
  'Change data only when the user clearly asks for it, never on your own initiative.',
  'If something required is missing or ambiguous (a date, an amount, a currency), ask one short',
  'question instead of guessing. Resolve relative dates ("yesterday", "on Friday") from today.',
  'After a change, confirm exactly what was saved (values, dates). You cannot delete anything:',
  'if asked to, explain that deleting is done in the dashboard.',
  'Every request to change data needs its own tool call in this turn, even if similar changes',
  'were made earlier in the conversation. Never say that something was saved, added or recorded',
  'unless a tool call in this turn returned success; if a tool returned an error, say so.',
];

export interface AskOptions {
  /** For Telegram and notifications: no markdown markup. */
  plainText?: boolean;
  /** Offer tools that change data (see AiTool.writes). */
  allowWrites?: boolean;
}

/**
 * AI gateway: any OpenAI-compatible API (DeepSeek, OpenAI, Ollama…).
 * Modules give the model access to their data through tools (see AiTool).
 *
 * Important: when a question is asked, the data the model requests is sent to the AI provider.
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

  // --- Settings ---

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

  /** Saves the settings and tests the connection with a short request. */
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

  // --- Model requests ---

  /**
   * Chat with access to module data: the model requests tools,
   * we run them and return the results until it gives an answer.
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
    const tools = options.allowWrites ? this.tools : this.tools.filter((tool) => !tool.writes);
    /** Write tools that succeeded in this turn. */
    const changes: string[] = [];
    const run = (conversation: ChatMessage[]) =>
      runToolLoop({
        messages: conversation,
        tools,
        complete: (current, definitions) => chatCompletion(connection, current, definitions),
        runTool: async (tool, rawArgs) => {
          const result = await this.runTool(userId, tool, rawArgs);
          if (tool?.writes && !result.startsWith('{"error"')) {
            changes.push(tool.name);
          }
          return result;
        },
        maxRounds: MAX_TOOL_ROUNDS,
      });
    try {
      const first = await run(messages);
      // "Recorded!" without a write tool call means nothing was saved: make the model fix it.
      if (!options.allowWrites || changes.length > 0 || !claimsChange(first.reply)) {
        return first;
      }
      this.logger.warn(`AI claimed a change without a tool call; asking again`);
      const second = await run([
        ...messages,
        { role: 'assistant', content: first.reply },
        { role: 'user', content: FAKE_CHANGE_CORRECTION },
      ]);
      return {
        reply: second.reply,
        toolsUsed: [...new Set([...first.toolsUsed, ...second.toolsUsed])],
      };
    } catch (error) {
      if (error instanceof AiRequestError) {
        throw new BadRequestException(`AI API error (${error.status})`);
      }
      throw error;
    }
  }

  /** A single request without tools (summaries, rewording). */
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
        ? `${result.slice(0, MAX_TOOL_RESULT_CHARS)}… (truncated)`
        : result;
    } catch (error) {
      this.logger.warn(`AI tool ${tool.name} failed: ${error}`);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async systemPrompt(
    userId: string,
    { plainText, allowWrites }: AskOptions,
  ): Promise<string> {
    const user = await this.users.findById(userId);
    const timeZone = this.config.get('APP_TIMEZONE', { infer: true });
    // The prompt is in English — models understand it better; the answer language comes from the user profile.
    return [
      `You are the assistant of ${user?.displayName ?? 'the user'}'s personal dashboard.`,
      `Today is ${toLocalDate(todayIn(timeZone))}, time zone ${timeZone}.`,
      `Always answer in ${coreMessages(user?.locale).aiLanguage}, briefly and to the point.`,
      'Get any data about the user only through the tools and never make things up;',
      'if there is no data, say so. Always state currencies for amounts.',
      plainText
        ? 'Write plain text without markdown formatting; emoji are fine.'
        : 'You may use markdown (lists, bold).',
      ...(allowWrites ? WRITE_RULES : []),
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
