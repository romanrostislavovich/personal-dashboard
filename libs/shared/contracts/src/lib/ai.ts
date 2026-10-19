import { z } from 'zod';
import { AI_ATTACHMENT_MAX_CHARS, AI_MAX_ATTACHMENTS } from './ai-attachments';

/**
 * Any OpenAI-compatible API. Presets fill in the default address and model,
 * `custom` — your own address (OpenRouter, LM Studio, a proxy…).
 */
export const AI_PROVIDERS = ['deepseek', 'openai', 'ollama', 'custom'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_PRESETS: Record<AiProvider, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-6-luna' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: '' },
  custom: { baseUrl: '', model: '' },
};

/**
 * A saved AI connection: provider, address, model and key. The user keeps several (e.g. DeepSeek
 * and OpenAI) and switches the active one in one click — say, when a balance runs out.
 */
export const aiConnectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    provider: z.enum(AI_PROVIDERS),
    baseUrl: z.url(),
    model: z.string().trim().min(1).max(100),
    /** Empty — keep the saved key (Ollama has no key at all). */
    apiKey: z.string().trim().max(500).optional(),
    /** USD for a million tokens of the prompt and of the answer (the provider's price list). */
    priceInput: z.number().min(0).max(1000).nullable().optional(),
    priceOutput: z.number().min(0).max(1000).nullable().optional(),
    /** At most this many USD a calendar month; the requests stop until the next one. */
    monthlyLimit: z.number().positive().max(100_000).nullable().optional(),
  })
  .refine(
    // A limit in money is counted from the prices.
    (input) =>
      input.monthlyLimit == null || (input.priceInput != null && input.priceOutput != null),
    { message: 'A monthly limit needs both prices', path: ['monthlyLimit'] },
  );
export type AiConnectionInput = z.infer<typeof aiConnectionInputSchema>;

/** The tokens of a period; `cost` in USD — null without the prices of the connection. */
export interface AiUsageTotals {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  /** Of the prompt tokens, the ones read from the provider's cache. */
  cachedTokens: number;
  cost: number | null;
}

export interface AiConnection {
  id: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  priceInput: number | null;
  priceOutput: number | null;
  monthlyLimit: number | null;
  /** On the user's own clock. */
  usage: { today: AiUsageTotals; month: AiUsageTotals };
}

/** When the morning digest is sent until the user picks another time. */
export const DEFAULT_DIGEST_TIME = '08:30';

/** A speech-to-text model of OpenAI; any model of the chosen connection works. */
export const DEFAULT_SPEECH_MODEL = 'gpt-4o-mini-transcribe';

/** A model of OpenAI that reads pictures (receipts); any model of the chosen connection works. */
export const DEFAULT_VISION_MODEL = 'gpt-4o-mini';

/** `PUT /api/ai/preferences`: only the fields sent are changed. */
export const aiPreferencesSchema = z.object({
  /** The morning digest via notifications. */
  morningDigest: z.boolean().optional(),
  /** When to send it, `HH:mm` on the user's own clock (see `CurrentUser.timeZone`). */
  morningDigestTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm')
    .optional(),
  /**
   * Which saved connection turns Telegram voice messages into text (its `/audio/transcriptions`).
   * `null` — the first OpenAI connection.
   */
  speechConnectionId: z.uuid().nullable().optional(),
  speechModel: z.string().trim().min(1).max(100).optional(),
  /**
   * Which saved connection reads pictures (receipts from Telegram); `null` — the first OpenAI
   * connection. DeepSeek, for one, sees no pictures.
   */
  visionConnectionId: z.uuid().nullable().optional(),
  visionModel: z.string().trim().min(1).max(100).optional(),
  /**
   * Modules whose data never goes to the AI provider: no assistant tools, no digest sections,
   * no diary summaries.
   */
  disabledModules: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  /** Optional sections of the morning digest that are switched on (ids from `digest-options`). */
  digestOptIns: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  /**
   * Sections whose AI requests go through a saved connection of their own (a local Ollama for
   * Health): module → connection id. Their data then never goes to the shared one — no tools in
   * the assistant's chat, no digest sections, no stories of Life. The whole map is replaced.
   */
  moduleConnections: z
    .record(z.string().trim().min(1).max(50), z.uuid())
    .refine((map) => Object.keys(map).length <= 50, 'Too many sections')
    .optional(),
  /**
   * Sections with a connection of their own that outside AI clients (MCP: Claude Desktop,
   * Cursor) may read anyway; the others with one stay hidden from them.
   */
  mcpModules: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
});
export type AiPreferences = z.infer<typeof aiPreferencesSchema>;

export interface AiSettings {
  morningDigest: boolean;
  /** `HH:mm` */
  morningDigestTime: string;
  speechConnectionId: string | null;
  speechModel: string;
  visionConnectionId: string | null;
  visionModel: string;
  disabledModules: string[];
  digestOptIns: string[];
  /** module → connection id; a section not listed uses the active connection. */
  moduleConnections: Record<string, string>;
  /** Sections with a connection of their own that MCP clients may read anyway. */
  mcpModules: string[];
  /** At least one connection exists — the AI features work. */
  configured: boolean;
  /** The connection every AI request goes through. */
  activeConnectionId: string | null;
  connections: AiConnection[];
}

export const aiAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
  text: z.string().max(AI_ATTACHMENT_MAX_CHARS),
});
export type AiAttachment = z.infer<typeof aiAttachmentSchema>;

/** `POST /api/ai/attachments`: the text of an uploaded file, to be sent with a chat message. */
export interface AiAttachmentUpload extends AiAttachment {
  /** The text was longer than AI_ATTACHMENT_MAX_CHARS and was cut. */
  truncated: boolean;
}

/** A message as the model gets it: the conversation so far is sent with every question. */
export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AiAttachment[];
}

/**
 * `POST /api/ai/chat`: one new message. The conversation is stored on the server and shared by
 * the web chat and Telegram; without `conversationId` the message goes to the current one.
 */
export const aiChatRequestSchema = z
  .object({
    conversationId: z.uuid().optional(),
    content: z.string().trim().max(20_000),
    attachments: z.array(aiAttachmentSchema).max(AI_MAX_ATTACHMENTS).optional(),
  })
  .refine((request) => request.content || request.attachments?.length, {
    message: 'Write a message or attach a file',
  });
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;

export interface AiChatResponse {
  conversationId: string;
  reply: string;
  /** Which data the model requested — shown under the answer. */
  toolsUsed: string[];
  /** The answer asks to confirm a deletion or an overwrite ("Yes" / "No"). */
  awaitsConfirmation?: boolean;
}

/** A stored message; file texts stay on the server, the client gets their names. */
export interface AiStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: string[];
  toolsUsed: string[];
  createdAt: string;
}

export interface AiConversation {
  id: string;
  /** The beginning of the first question; `null` while the conversation is empty. */
  title: string | null;
  updatedAt: string;
}

/** How a change by the assistant ended: made, a confirmation asked for, or failed. */
export type AiActionOutcome = 'done' | 'asked' | 'failed';

/** A change the assistant made or tried to make (the log in the AI settings). */
export interface AiAction {
  id: string;
  tool: string;
  module: string;
  /** The arguments as JSON (the beginning if long). */
  args: string;
  outcome: AiActionOutcome;
  error: string | null;
  createdAt: string;
}

export interface AiConversationDetail extends AiConversation {
  messages: AiStoredMessage[];
}
