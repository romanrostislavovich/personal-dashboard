import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiActionOutcome, AiChatMessage } from '@pd/contracts';
import { AppConfig } from '../config/env';
import { coreMessages } from '../i18n/core.messages';
import { UsersService } from '../users/users.service';
import { AiActionsService } from './ai-actions.service';
import { AiConnectionsService } from './ai-connections.service';
import { PromptOptions, systemPrompt } from './ai-prompt';
import { AiTool } from './ai-tool';
import { withAttachments } from './attachment-text';
import { claimsChange, FAKE_CHANGE_CORRECTION } from './claims-change';
import {
  AiRequestError,
  ChatConnection,
  chatCompletion,
  ChatMessage,
} from './openai-compatible.client';
import { callKey, PendingConfirmations } from './pending-confirmations';
import { runToolLoop } from './tool-loop';

/** How many times in a row the model may call tools before answering (look up → change → check). */
const MAX_TOOL_ROUNDS = 8;
/** Tool output is truncated so it does not bloat the context (and the token bill). */
const MAX_TOOL_RESULT_CHARS = 12_000;

export type AskOptions = Omit<PromptOptions, 'hasAttachments'>;

export interface AiAnswer {
  reply: string;
  /** Modules the model took data from. */
  toolsUsed: string[];
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
  private readonly confirmations = new PendingConfirmations();
  /** Numbers `ask()` calls: a confirmation must come from a later turn than the request. */
  private turns = 0;

  constructor(
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly connections: AiConnectionsService,
    private readonly users: UsersService,
    private readonly actions: AiActionsService,
  ) {}

  registerTool(tool: AiTool): void {
    if (tool.confirm && !tool.writes) {
      // Otherwise it would be offered where the user cannot confirm anything.
      throw new Error(`AI tool ${tool.name}: \`confirm\` requires \`writes: true\``);
    }
    this.tools.push(tool);
  }

  async isConfigured(userId: string): Promise<boolean> {
    return (await this.connections.active(userId)) !== null;
  }

  /** Modules that give the AI data: the ones the user can switch off in the AI settings. */
  modules(): string[] {
    return [...new Set(this.tools.map((tool) => tool.module))].sort();
  }

  /** Whether the user lets the AI see this module's data. */
  async canSee(userId: string, module: string): Promise<boolean> {
    return !(await this.connections.disabledModules(userId)).includes(module);
  }

  // --- Model requests ---

  /**
   * Chat with access to module data: the model requests tools,
   * we run them and return the results until it gives an answer.
   */
  async ask(userId: string, history: AiChatMessage[], options: AskOptions = {}): Promise<AiAnswer> {
    const connection = await this.requireConnection(userId);
    const hasAttachments = history.some((message) => message.attachments?.length);
    const user = await this.users.findById(userId);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        // "Today" and "tomorrow at 9" are the user's own, wherever the server stands.
        content: systemPrompt(user, this.users.timeZoneOf(user), { ...options, hasAttachments }),
      },
      ...history.map(({ role, content, attachments }) => ({
        role,
        content: withAttachments(content, attachments),
      })),
    ];
    const hidden = new Set(await this.connections.disabledModules(userId));
    const tools = this.tools.filter(
      (tool) => !hidden.has(tool.module) && (options.allowWrites || !tool.writes),
    );
    const turn = ++this.turns;
    /** Write tools that changed data in this turn. */
    const changes: string[] = [];
    const run = (conversation: ChatMessage[]) =>
      runToolLoop({
        messages: conversation,
        tools,
        complete: (current, definitions) => chatCompletion(connection, current, definitions),
        runTool: async (tool, rawArgs) => {
          const { output, changed } = await this.runTool(userId, tool, rawArgs, turn);
          if (changed && tool) {
            changes.push(tool.name);
          }
          return output;
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

  /**
   * A single request without tools (summaries, rewording). `module` — whose data `content` is:
   * refused if the user has switched that module off for the AI.
   */
  async complete(
    userId: string,
    instruction: string,
    content: string,
    module?: string,
  ): Promise<string> {
    if (module && !(await this.canSee(userId, module))) {
      throw new ForbiddenException(`AI access to ${module} is off`);
    }
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

  /**
   * A single request about a picture (a receipt): the connection that reads pictures answers.
   * `null` — there is none (see AiConnectionsService.vision).
   */
  async completeWithImage(
    userId: string,
    instruction: string,
    image: { data: Buffer; mimeType: string },
    module?: string,
  ): Promise<string | null> {
    if (module && !(await this.canSee(userId, module))) {
      throw new ForbiddenException(`AI access to ${module} is off`);
    }
    const connection = await this.connections.vision(userId);
    if (!connection) {
      return null;
    }
    const language = coreMessages((await this.users.findById(userId))?.locale).aiLanguage;
    const url = `data:${image.mimeType};base64,${image.data.toString('base64')}`;
    try {
      const reply = await chatCompletion(connection, [
        { role: 'system', content: `${instruction} Always answer in ${language}.` },
        { role: 'user', content: [{ type: 'image_url', image_url: { url } }] },
      ]);
      return reply.content ?? '';
    } catch (error) {
      if (error instanceof AiRequestError) {
        throw new BadRequestException(`AI API error (${error.status})`);
      }
      throw error;
    }
  }

  /** Runs a tool call; `changed` — a write tool actually changed data. */
  private async runTool(
    userId: string,
    tool: AiTool | undefined,
    rawArgs: string,
    turn: number,
  ): Promise<{ output: string; changed: boolean }> {
    if (!tool) {
      return { output: JSON.stringify({ error: 'Unknown tool' }), changed: false };
    }
    let args: Record<string, unknown> = {};
    // Changes go to the log (AiActionsService); reads are not worth it.
    const log = (outcome: AiActionOutcome, error?: string) =>
      tool.writes
        ? this.actions.record(userId, {
            tool: tool.name,
            module: tool.module,
            args,
            outcome,
            error,
          })
        : Promise.resolve();
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
      if (
        tool.confirm &&
        !this.confirmations.confirmOrRequest(userId, callKey(tool.name, args), turn)
      ) {
        const willAffect = await tool.confirm(userId, args);
        await log('asked');
        return { output: JSON.stringify(confirmationRequest(willAffect)), changed: false };
      }
      const value = await tool.handler(userId, args);
      await log('done');
      const result = value === undefined ? '{"done":true}' : JSON.stringify(value);
      // A cut answer must not pass for a whole one: the model would answer from a part of the
      // data as if it were all of it ("no such track in your top").
      const output =
        result.length > MAX_TOOL_RESULT_CHARS
          ? `${result.slice(0, MAX_TOOL_RESULT_CHARS)}… [CUT: only the first ` +
            `${MAX_TOOL_RESULT_CHARS} of ${result.length} characters are shown, the rest of the ` +
            'data is missing. Do not answer from this part as if it were everything: call the ' +
            'tool again with a filter, a shorter period or a smaller limit, or use a more ' +
            'specific tool.]'
          : result;
      return { output, changed: Boolean(tool.writes) };
    } catch (error) {
      this.logger.warn(`AI tool ${tool.name} failed: ${error}`);
      const message = error instanceof Error ? error.message : String(error);
      await log('failed', message);
      return { output: JSON.stringify({ error: message }), changed: false };
    }
  }

  private async requireConnection(userId: string): Promise<ChatConnection> {
    const connection = await this.connections.active(userId);
    if (!connection) {
      throw new BadRequestException('AI is not configured');
    }
    return connection;
  }
}

/** What a tool with `confirm` returns to the model on the first call. */
function confirmationRequest(willAffect: unknown) {
  return {
    confirmationRequired: true,
    nothingChangedYet: true,
    willAffect,
    next:
      'Tell the user exactly what will be deleted or overwritten and ask to confirm. ' +
      'If they agree in their next message, call this tool again with the same arguments.',
  };
}
