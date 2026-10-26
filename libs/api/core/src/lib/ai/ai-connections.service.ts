import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiConnection,
  AiConnectionInput,
  AiPreferences,
  AiProvider,
  AiSettings,
  DEFAULT_DIGEST_TIME,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_VISION_MODEL,
  LocalDate,
  zonedDateTime,
} from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { SecretsService } from '../secrets/secrets.service';
import { users } from '../users/users.schema';
import { UsersService } from '../users/users.service';
import { AiConnectionRow, aiConnections, aiSettings } from './ai.schema';
import { AiUsageService } from './ai-usage.service';
import { isDigestDue } from './digest-schedule';
import {
  AiRequestError,
  ChatConnection,
  chatCompletion,
  embed,
  SpeechConnection,
} from './openai-compatible.client';
import { OutboundBlockedError } from '../net/outbound';

/** The API key of a connection in SecretsService. */
const apiKeySecret = (connectionId: string) => `ai.connection.${connectionId}`;

/**
 * Saved AI connections (DeepSeek, OpenAI, a local Ollama…) and which one is active.
 * Every connection is checked with a short request before it is saved, so switching to it
 * later just works. Keys are stored encrypted and never returned.
 */
/** OpenAI's own small embedding model, when an OpenAI connection makes the vectors. */
const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * The model that turns speech into text. A chat model typed into the field by mistake (the owner
 * had `gpt-6-luna` there, and OpenAI answered every recording with "Invalid URL") can never do
 * it, so the default one is used instead; a model of another provider passes when its name says
 * it is for speech (whisper, transcribe, speech, audio, stt).
 */
export function speechModelOf(chosen: string | null | undefined): string {
  return chosen && /whisper|transcri|speech|audio|stt/i.test(chosen)
    ? chosen
    : DEFAULT_SPEECH_MODEL;
}

@Injectable()
export class AiConnectionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly secrets: SecretsService,
    private readonly users: UsersService,
    private readonly usage: AiUsageService,
  ) {}

  async settings(userId: string): Promise<AiSettings> {
    const rows = await this.rows(userId);
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    // Oldest first: the order of the Telegram `/model` list.
    const usage = await this.usage.summary(userId, rows);
    const connections = await Promise.all(rows.map((row) => this.toConnection(userId, row, usage)));
    // A user who never saved the settings has the defaults of the table.
    const stored = settings ?? defaultSettings(userId);
    return {
      configured: rows.length > 0,
      activeConnectionId: activeRow(rows, stored.activeConnectionId)?.id ?? null,
      connections,
      morningDigest: stored.morningDigest,
      morningDigestTime: stored.morningDigestTime,
      speechConnectionId: stored.speechConnectionId,
      speechModel: stored.speechModel,
      visionConnectionId: stored.visionConnectionId,
      visionModel: stored.visionModel,
      lightConnectionId: stored.lightConnectionId,
      embeddingConnectionId: stored.embeddingConnectionId,
      embeddingModel: stored.embeddingModel,
      disabledModules: stored.disabledModules,
      digestOptIns: stored.digestOptIns,
      moduleConnections: stored.moduleConnections,
      mcpModules: stored.mcpModules,
    };
  }

  /** Modules whose data the AI must not get. */
  async disabledModules(userId: string): Promise<string[]> {
    const [settings] = await this.db
      .select({ disabledModules: aiSettings.disabledModules })
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId));
    return settings?.disabledModules ?? [];
  }

  /**
   * Modules whose data must not go to the shared connection: the ones switched off for the AI
   * and the ones with a connection of their own (unless it is the active one anyway).
   */
  async hiddenFromShared(userId: string): Promise<string[]> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const activeId = activeRow(await this.rows(userId), settings?.activeConnectionId)?.id;
    return hiddenFromShared(settings ?? {}, activeId);
  }

  /**
   * Modules an outside AI client (MCP) never gets: the ones switched off for the AI, and the
   * ones with a connection of their own unless the user let MCP clients read them.
   */
  async hiddenFromOutside(userId: string): Promise<string[]> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const allowed = new Set(settings?.mcpModules ?? []);
    const own = Object.keys(settings?.moduleConnections ?? {}).filter(
      (module) => !allowed.has(module),
    );
    return [...new Set([...(settings?.disabledModules ?? []), ...own])];
  }

  /**
   * The connection of a section of its own; `null` — the section uses the shared one. A chosen
   * connection that is gone is an error, never a quiet fall back to the shared one: the user
   * chose it to keep the data away from there.
   */
  async ofModule(userId: string, module: string): Promise<ChatConnection | null> {
    const [settings] = await this.db
      .select({ moduleConnections: aiSettings.moduleConnections })
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId));
    const id = settings?.moduleConnections[module];
    if (!id) {
      return null;
    }
    const connection = await this.connection(userId, id);
    if (!connection) {
      throw new BadRequestException(`The AI connection of ${module} is gone`);
    }
    return connection;
  }

  /** Opt-in sections of the morning digest the user switched on. */
  async digestOptIns(userId: string): Promise<string[]> {
    const [settings] = await this.db
      .select({ digestOptIns: aiSettings.digestOptIns })
      .from(aiSettings)
      .where(eq(aiSettings.userId, userId));
    return settings?.digestOptIns ?? [];
  }

  /** Adds a connection; the first one becomes active. */
  async create(userId: string, input: AiConnectionInput): Promise<AiSettings> {
    const apiKey = input.apiKey || null;
    await verify(toChatConnection(input, apiKey));
    const [row] = await this.db
      .insert(aiConnections)
      .values({ userId, ...connectionFields(input) })
      .returning();
    if (apiKey) {
      await this.secrets.set(userId, apiKeySecret(row.id), apiKey);
    }
    if ((await this.rows(userId)).length === 1) {
      await this.setActive(userId, row.id);
    }
    return this.settings(userId);
  }

  /** Changes a connection; an empty key keeps the saved one. */
  async update(userId: string, id: string, input: AiConnectionInput): Promise<AiSettings> {
    await this.find(userId, id);
    const apiKey = input.apiKey || (await this.secrets.get(userId, apiKeySecret(id)));
    await verify(toChatConnection(input, apiKey));
    await this.db
      .update(aiConnections)
      .set(connectionFields(input))
      .where(and(eq(aiConnections.id, id), eq(aiConnections.userId, userId)));
    if (input.apiKey) {
      await this.secrets.set(userId, apiKeySecret(id), input.apiKey);
    }
    return this.settings(userId);
  }

  async remove(userId: string, id: string): Promise<AiSettings> {
    await this.find(userId, id);
    // The foreign key clears `activeConnectionId`; `activeRow` then falls back to another one.
    await this.db
      .delete(aiConnections)
      .where(and(eq(aiConnections.id, id), eq(aiConnections.userId, userId)));
    await this.secrets.delete(userId, apiKeySecret(id));
    // A section that had this connection is not left pointing at nothing.
    const { moduleConnections } = await this.settings(userId);
    if (Object.values(moduleConnections).includes(id)) {
      await this.db
        .update(aiSettings)
        .set({
          moduleConnections: Object.fromEntries(
            Object.entries(moduleConnections).filter(([, connectionId]) => connectionId !== id),
          ),
        })
        .where(eq(aiSettings.userId, userId));
    }
    return this.settings(userId);
  }

  /** The one-click switch: from now on every AI request goes through this connection. */
  async activate(userId: string, id: string): Promise<AiSettings> {
    await this.find(userId, id);
    await this.setActive(userId, id);
    return this.settings(userId);
  }

  /** Only the fields sent change (Drizzle skips `undefined` ones). */
  async savePreferences(userId: string, preferences: AiPreferences): Promise<AiSettings> {
    if (preferences.speechConnectionId) {
      await this.find(userId, preferences.speechConnectionId);
    }
    if (preferences.visionConnectionId) {
      await this.find(userId, preferences.visionConnectionId);
    }
    if (preferences.lightConnectionId) {
      await this.find(userId, preferences.lightConnectionId);
    }
    if (preferences.embeddingConnectionId) {
      await this.find(userId, preferences.embeddingConnectionId);
    }
    for (const id of Object.values(preferences.moduleConnections ?? {})) {
      await this.find(userId, id);
    }
    await this.db
      .insert(aiSettings)
      .values({ userId, ...preferences })
      .onConflictDoUpdate({ target: aiSettings.userId, set: preferences });
    return this.settings(userId);
  }

  /**
   * The connection that turns voice messages into text: the chosen one, or the first OpenAI one;
   * `null` — none (DeepSeek, for one, has no speech recognition).
   */
  async speech(userId: string): Promise<SpeechConnection | null> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const rows = await this.rows(userId);
    const row =
      rows.find((r) => r.id === settings?.speechConnectionId) ??
      rows.find((r) => r.provider === 'openai');
    if (!row) {
      return null;
    }
    return {
      baseUrl: row.baseUrl,
      apiKey: await this.secrets.get(userId, apiKeySecret(row.id)),
      model: speechModelOf(settings?.speechModel),
    };
  }

  /**
   * The connection that reads pictures: the chosen one with its vision model, or the first
   * OpenAI one; `null` — none (DeepSeek, for one, sees no pictures).
   */
  async vision(userId: string): Promise<ChatConnection | null> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const rows = await this.rows(userId);
    const row =
      rows.find((r) => r.id === settings?.visionConnectionId) ??
      rows.find((r) => r.provider === 'openai');
    if (!row) {
      return null;
    }
    const apiKey = await this.secrets.get(userId, apiKeySecret(row.id));
    // The connection's own model is swapped for the vision one, and with it what it accepts.
    return toChatConnection(
      { ...row, model: settings?.visionModel ?? DEFAULT_VISION_MODEL },
      apiKey,
    );
  }

  /**
   * The connection for light background work (see AiPreferences.lightConnectionId); null —
   * none chosen, the active one does it.
   */
  async light(userId: string): Promise<ChatConnection | null> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    return settings?.lightConnectionId ? this.connection(userId, settings.lightConnectionId) : null;
  }

  /**
   * The connection that makes the vectors of search by meaning, with the embedding model:
   * the chosen one, else the first Ollama one (local), else the first OpenAI one (its own
   * small embedding model); `null` — none, search by meaning is off.
   */
  async embedding(userId: string): Promise<ChatConnection | null> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const rows = await this.rows(userId);
    const chosen = rows.find((r) => r.id === settings?.embeddingConnectionId);
    const row =
      chosen ??
      rows.find((r) => r.provider === 'ollama') ??
      rows.find((r) => r.provider === 'openai');
    if (!row) {
      return null;
    }
    const model =
      chosen || row.provider === 'ollama'
        ? (settings?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL)
        : OPENAI_EMBEDDING_MODEL;
    return toChatConnection(
      { ...row, model },
      await this.secrets.get(userId, apiKeySecret(row.id)),
    );
  }

  /** One saved connection by its id (the security agent may have its own); null — gone. */
  async connection(userId: string, id: string): Promise<ChatConnection | null> {
    const row = (await this.rows(userId)).find((item) => item.id === id);
    if (!row) {
      return null;
    }
    return toChatConnection(row, await this.secrets.get(userId, apiKeySecret(row.id)));
  }

  /** The connection AI requests go through; null — AI is not configured. */
  async active(userId: string): Promise<ChatConnection | null> {
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    const row = activeRow(await this.rows(userId), settings?.activeConnectionId);
    if (!row) {
      return null;
    }
    const apiKey = await this.secrets.get(userId, apiKeySecret(row.id));
    return toChatConnection(row, apiKey);
  }

  /**
   * Users whose morning digest is due: it is on, their time has come on their own clock,
   * today's is not handled. `today` is the user's day — the one to mark as handled.
   */
  async usersWithDigestDue(at: Date = new Date()): Promise<{ userId: string; today: LocalDate }[]> {
    const rows = await this.db
      .select({
        userId: aiSettings.userId,
        time: aiSettings.morningDigestTime,
        lastDay: aiSettings.morningDigestDay,
        timeZone: users.timeZone,
      })
      .from(aiSettings)
      .innerJoin(users, eq(users.id, aiSettings.userId))
      .where(eq(aiSettings.morningDigest, true));
    return rows.flatMap((row) => {
      const now = zonedDateTime(at, this.users.timeZoneOf(row));
      return isDigestDue(row, now.date, now.time) ? [{ userId: row.userId, today: now.date }] : [];
    });
  }

  /** Today's digest of the user is handled: the next one goes out tomorrow. */
  async markDigestDay(userId: string, day: LocalDate): Promise<void> {
    await this.db
      .update(aiSettings)
      .set({ morningDigestDay: day })
      .where(eq(aiSettings.userId, userId));
  }

  private rows(userId: string): Promise<AiConnectionRow[]> {
    return this.db
      .select()
      .from(aiConnections)
      .where(eq(aiConnections.userId, userId))
      .orderBy(asc(aiConnections.createdAt));
  }

  private async find(userId: string, id: string): Promise<AiConnectionRow> {
    const row = (await this.rows(userId)).find((r) => r.id === id);
    if (!row) {
      throw new NotFoundException('AI connection not found');
    }
    return row;
  }

  private async setActive(userId: string, id: string): Promise<void> {
    await this.db
      .insert(aiSettings)
      .values({ userId, activeConnectionId: id })
      .onConflictDoUpdate({ target: aiSettings.userId, set: { activeConnectionId: id } });
  }

  private async toConnection(
    userId: string,
    row: AiConnectionRow,
    usage: Awaited<ReturnType<AiUsageService['summary']>>,
  ): Promise<AiConnection> {
    const none = { requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, cost: null };
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as AiProvider,
      baseUrl: row.baseUrl,
      model: row.model,
      hasApiKey: await this.secrets.has(userId, apiKeySecret(row.id)),
      priceInput: row.priceInput,
      priceOutput: row.priceOutput,
      monthlyLimit: row.monthlyLimit,
      usage: usage.get(row.id) ?? { today: none, month: none },
    };
  }

  /**
   * A local model (Ollama) to do the background work (summaries, extraction) when the chosen
   * connection's monthly limit is spent; null — there is none besides `exceptId`.
   */
  async localFallback(userId: string, exceptId?: string): Promise<ChatConnection | null> {
    const row = (await this.rows(userId)).find(
      (one) => one.provider === 'ollama' && one.id !== exceptId,
    );
    return row ? toChatConnection(row, await this.secrets.get(userId, apiKeySecret(row.id))) : null;
  }
}

/**
 * Modules switched off for the AI, and the ones with a connection of their own other than the
 * active one: their data never goes to the shared connection.
 */
export function hiddenFromShared(
  settings: { disabledModules?: string[]; moduleConnections?: Record<string, string> },
  activeId: string | undefined,
): string[] {
  const own = Object.entries(settings.moduleConnections ?? {})
    .filter(([, connectionId]) => connectionId !== activeId)
    .map(([module]) => module);
  return [...new Set([...(settings.disabledModules ?? []), ...own])];
}

/** The chosen connection, or the oldest one if the choice was deleted. */
function activeRow(
  rows: AiConnectionRow[],
  activeId: string | null | undefined,
): AiConnectionRow | undefined {
  return rows.find((row) => row.id === activeId) ?? rows[0];
}

function connectionFields(input: AiConnectionInput) {
  const { name, provider, baseUrl, model } = input;
  return {
    name,
    provider,
    baseUrl,
    model,
    priceInput: input.priceInput ?? null,
    priceOutput: input.priceOutput ?? null,
    monthlyLimit: input.monthlyLimit ?? null,
  };
}

/** The settings of a user who never saved any: the defaults of `ai_settings`. */
function defaultSettings(userId: string): typeof aiSettings.$inferSelect {
  return {
    userId,
    activeConnectionId: null,
    morningDigest: false,
    morningDigestTime: DEFAULT_DIGEST_TIME,
    morningDigestDay: null,
    speechConnectionId: null,
    speechModel: DEFAULT_SPEECH_MODEL,
    visionConnectionId: null,
    visionModel: DEFAULT_VISION_MODEL,
    lightConnectionId: null,
    embeddingConnectionId: null,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    disabledModules: [],
    digestOptIns: [],
    moduleConnections: {},
    mcpModules: [],
  };
}

function toChatConnection(
  {
    id,
    provider,
    baseUrl,
    model,
  }: { id?: string; provider: string; baseUrl: string; model: string },
  apiKey: string | null,
): ChatConnection {
  return {
    id,
    baseUrl,
    model,
    apiKey,
    // OpenAI GPT-6 calls tools in Chat Completions only without reasoning (see the client).
    ...(acceptsReasoningEffort(provider, model) ? { reasoningEffort: 'none' as const } : {}),
  };
}

/**
 * Whether the model takes `reasoning_effort`. The older OpenAI models do not and answer 400 to
 * a request that has it — gpt-4o-mini, the default model for pictures, among them.
 */
export function acceptsReasoningEffort(provider: string, model: string): boolean {
  return provider === 'openai' && !/^(chatgpt-|gpt-3|gpt-4)/i.test(model);
}

/**
 * A short request: a wrong URL, model or key is reported now, not in the middle of a chat. A
 * model that only makes vectors (search by meaning: `paraphrase-multilingual` on the server)
 * does not chat, so it is asked for a vector instead.
 */
async function verify(connection: ChatConnection): Promise<void> {
  try {
    await chatCompletion(connection, [{ role: 'user', content: 'ping' }]).catch(async (error) => {
      if (!(error instanceof AiRequestError)) {
        throw error;
      }
      await embed(connection, ['ping']).catch(() => {
        throw error;
      });
    });
  } catch (error) {
    throw new BadRequestException(
      error instanceof AiRequestError
        ? `AI API rejected the request (${error.status})`
        : error instanceof OutboundBlockedError
          ? error.message
          : 'AI API is unreachable',
    );
  }
}
