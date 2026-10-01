import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiConnection,
  AiConnectionInput,
  AiPreferences,
  AiProvider,
  AiSettings,
  DEFAULT_SPEECH_MODEL,
} from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { SecretsService } from '../secrets/secrets.service';
import { AiConnectionRow, aiConnections, aiSettings } from './ai.schema';
import {
  AiRequestError,
  ChatConnection,
  chatCompletion,
  SpeechConnection,
} from './openai-compatible.client';

/** The API key of a connection in SecretsService. */
const apiKeySecret = (connectionId: string) => `ai.connection.${connectionId}`;

/**
 * Saved AI connections (DeepSeek, OpenAI, a local Ollama…) and which one is active.
 * Every connection is checked with a short request before it is saved, so switching to it
 * later just works. Keys are stored encrypted and never returned.
 */
@Injectable()
export class AiConnectionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly secrets: SecretsService,
  ) {}

  async settings(userId: string): Promise<AiSettings> {
    const rows = await this.rows(userId);
    const [settings] = await this.db.select().from(aiSettings).where(eq(aiSettings.userId, userId));
    // Oldest first: the order of the Telegram `/model` list.
    const connections = await Promise.all(rows.map((row) => this.toConnection(userId, row)));
    return {
      configured: rows.length > 0,
      activeConnectionId: activeRow(rows, settings?.activeConnectionId)?.id ?? null,
      connections,
      morningDigest: settings?.morningDigest ?? false,
      speechConnectionId: settings?.speechConnectionId ?? null,
      speechModel: settings?.speechModel ?? DEFAULT_SPEECH_MODEL,
      disabledModules: settings?.disabledModules ?? [],
      digestOptIns: settings?.digestOptIns ?? [],
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
      model: settings?.speechModel ?? DEFAULT_SPEECH_MODEL,
    };
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

  async usersWithMorningDigest(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: aiSettings.userId })
      .from(aiSettings)
      .where(eq(aiSettings.morningDigest, true));
    return rows.map((row) => row.userId);
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

  private async toConnection(userId: string, row: AiConnectionRow): Promise<AiConnection> {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as AiProvider,
      baseUrl: row.baseUrl,
      model: row.model,
      hasApiKey: await this.secrets.has(userId, apiKeySecret(row.id)),
    };
  }
}

/** The chosen connection, or the oldest one if the choice was deleted. */
function activeRow(
  rows: AiConnectionRow[],
  activeId: string | null | undefined,
): AiConnectionRow | undefined {
  return rows.find((row) => row.id === activeId) ?? rows[0];
}

function connectionFields({ name, provider, baseUrl, model }: AiConnectionInput) {
  return { name, provider, baseUrl, model };
}

function toChatConnection(
  { provider, baseUrl, model }: { provider: string; baseUrl: string; model: string },
  apiKey: string | null,
): ChatConnection {
  return {
    baseUrl,
    model,
    apiKey,
    // OpenAI GPT-6 calls tools in Chat Completions only without reasoning (see the client).
    ...(provider === 'openai' ? { reasoningEffort: 'none' as const } : {}),
  };
}

/** A short request: a wrong URL, model or key is reported now, not in the middle of a chat. */
async function verify(connection: ChatConnection): Promise<void> {
  try {
    await chatCompletion(connection, [{ role: 'user', content: 'ping' }]);
  } catch (error) {
    throw new BadRequestException(
      error instanceof AiRequestError
        ? `AI API rejected the request (${error.status})`
        : 'AI API is unreachable',
    );
  }
}
