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
import { LinksService } from '../links/links.service';
import { UsersService } from '../users/users.service';
import { AiActionsService } from './ai-actions.service';
import { AiConnectionsService } from './ai-connections.service';
import { NO_JUDGEMENT, PromptOptions, systemPrompt } from './ai-prompt';
import { AiTool } from './ai-tool';
import { withAttachments } from './attachment-text';
import { claimsChange, FAKE_CHANGE_CORRECTION } from './claims-change';
import { AiLimitError, AiUsageService } from './ai-usage.service';
import { AiRequestError, ChatConnection, ChatMessage } from './openai-compatible.client';
import { callKey, PendingConfirmations } from './pending-confirmations';
import { runToolLoop } from './tool-loop';

/** How many times in a row the model may call tools before answering (look up → change → check). */
const MAX_TOOL_ROUNDS = 8;
/** Tool output is truncated so it does not bloat the context (and the token bill). */
const MAX_TOOL_RESULT_CHARS = 12_000;

export type AskOptions = Omit<PromptOptions, 'hasAttachments'>;

/** A picture sent to the AI. */
export interface AiImage {
  data: Buffer;
  mimeType: string;
}

export interface CompleteOptions {
  /**
   * The answer keeps the language of the content (what is read out of a document) instead of
   * the user's; by default it is in the user's language.
   */
  keepLanguage?: boolean;
}

export interface AiAnswer {
  reply: string;
  /** Modules the model took data from. */
  toolsUsed: string[];
  /** A tool asked to confirm a deletion or an overwrite: the reply asks "shall I?". */
  awaitsConfirmation?: boolean;
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
    private readonly links: LinksService,
    private readonly usage: AiUsageService,
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

  /**
   * Whether this module's data may go into a request of the shared connection (a story of Life
   * across the modules): not for a module switched off or with a connection of its own.
   */
  async canShare(userId: string, module: string): Promise<boolean> {
    return !(await this.hiddenFromShared(userId)).includes(module);
  }

  /** Modules whose data a tool across the sections leaves out (see `canShare`). */
  hiddenFromShared(userId: string): Promise<string[]> {
    return this.connections.hiddenFromShared(userId);
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
        content: systemPrompt(user, this.users.timeZoneOf(user), {
          ...options,
          hasAttachments,
          pages: this.links.pages(),
        }),
      },
      ...history.map(({ role, content, attachments }) => ({
        role,
        content: withAttachments(content, attachments),
      })),
    ];
    // A section with a connection of its own keeps its data away from the chat's one.
    const hidden = new Set(await this.hiddenFromShared(userId));
    const tools = this.tools.filter(
      (tool) => !hidden.has(tool.module) && (options.allowWrites || !tool.writes),
    );
    const turn = ++this.turns;
    /** Write tools that changed data in this turn. */
    const changes: string[] = [];
    let asked = false;
    const run = (conversation: ChatMessage[]) =>
      runToolLoop({
        messages: conversation,
        tools,
        complete: (current, definitions) =>
          this.usage.complete(userId, connection, current, definitions),
        runTool: async (tool, rawArgs) => {
          const { output, changed, asks } = await this.runTool(userId, tool, rawArgs, turn);
          if (changed && tool) {
            changes.push(tool.name);
          }
          asked ||= asks === true;
          return output;
        },
        maxRounds: MAX_TOOL_ROUNDS,
      });
    try {
      const first = await run(messages);
      // "Recorded!" without a write tool call means nothing was saved: make the model fix it.
      if (!options.allowWrites || changes.length > 0 || !claimsChange(first.reply)) {
        return { ...first, awaitsConfirmation: asked };
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
        awaitsConfirmation: asked,
      };
    } catch (error) {
      throw this.requestFailed(error);
    }
  }

  /**
   * A single request without tools (summaries, rewording). `module` — whose data `content` is:
   * refused if the user has switched that module off for the AI, sent to the module's own
   * connection if it has one.
   */
  async complete(
    userId: string,
    instruction: string,
    content: string,
    module?: string,
    options: CompleteOptions = {},
  ): Promise<string> {
    if (module && !(await this.canSee(userId, module))) {
      throw new ForbiddenException(`AI access to ${module} is off`);
    }
    const connection =
      (module && (await this.connections.ofModule(userId, module))) ||
      (await this.requireConnection(userId));
    const system = await this.withLanguage(userId, `${instruction} ${NO_JUDGEMENT}`, options);
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content },
    ];
    try {
      const reply = await this.usage
        .complete(userId, connection, messages)
        .catch(async (error: unknown) => {
          // Background work goes on with a local model once the limit is spent.
          const local =
            error instanceof AiLimitError &&
            (await this.connections.localFallback(userId, connection.id));
          if (!local) {
            throw error;
          }
          this.logger.log(`${error.message}; a local model answers instead`);
          return this.usage.complete(userId, local, messages);
        });
      return reply.content ?? '';
    } catch (error) {
      throw this.requestFailed(error);
    }
  }

  /**
   * A single request about a picture (a receipt), or several (the pages of a document, in
   * order): the module's own connection answers, or else the one that reads pictures.
   * `null` — there is none (see AiConnectionsService.vision).
   */
  async completeWithImage(
    userId: string,
    instruction: string,
    image: AiImage | AiImage[],
    module?: string,
    options: CompleteOptions = {},
  ): Promise<string | null> {
    if (module && !(await this.canSee(userId, module))) {
      throw new ForbiddenException(`AI access to ${module} is off`);
    }
    const connection =
      (module && (await this.connections.ofModule(userId, module))) ||
      (await this.connections.vision(userId));
    if (!connection) {
      return null;
    }
    const system = await this.withLanguage(userId, instruction, options);
    const content = (Array.isArray(image) ? image : [image]).map((one) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${one.mimeType};base64,${one.data.toString('base64')}` },
    }));
    try {
      const reply = await this.usage.complete(userId, connection, [
        { role: 'system', content: system },
        { role: 'user', content },
      ]);
      return reply.content ?? '';
    } catch (error) {
      throw this.requestFailed(error);
    }
  }

  /** What the user is told when a request fails: the provider's words stay in the log. */
  private requestFailed(error: unknown): unknown {
    if (error instanceof AiRequestError) {
      this.logger.warn(error.message.slice(0, 500));
      return new BadRequestException(`AI API error (${error.status})`);
    }
    if (error instanceof AiLimitError) {
      return new AiLimitException(error.connectionName, error.message);
    }
    return error;
  }

  /** The instruction, told to answer in the user's language unless the text keeps its own. */
  private async withLanguage(
    userId: string,
    instruction: string,
    { keepLanguage }: CompleteOptions,
  ): Promise<string> {
    if (keepLanguage) {
      return instruction;
    }
    const language = coreMessages((await this.users.findById(userId))?.locale).aiLanguage;
    return `${instruction} Always answer in ${language}.`;
  }

  /** Runs a tool call; `changed` — a write tool actually changed data. */
  private async runTool(
    userId: string,
    tool: AiTool | undefined,
    rawArgs: string,
    turn: number,
  ): Promise<{ output: string; changed: boolean; asks?: boolean }> {
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
        return {
          output: JSON.stringify(confirmationRequest(willAffect)),
          changed: false,
          asks: true,
        };
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

/** The monthly limit of the connection is spent (see AiUsageService). */
export class AiLimitException extends BadRequestException {
  constructor(
    readonly connectionName: string,
    message: string,
  ) {
    super(message);
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
