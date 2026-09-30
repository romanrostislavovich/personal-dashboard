import { z } from 'zod';

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
export const aiConnectionInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.url(),
  model: z.string().trim().min(1).max(100),
  /** Empty — keep the saved key (Ollama has no key at all). */
  apiKey: z.string().trim().max(500).optional(),
});
export type AiConnectionInput = z.infer<typeof aiConnectionInputSchema>;

export interface AiConnection {
  id: string;
  name: string;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

/** A speech-to-text model of OpenAI; any model of the chosen connection works. */
export const DEFAULT_SPEECH_MODEL = 'gpt-4o-mini-transcribe';

/** `PUT /api/ai/preferences`: only the fields sent are changed. */
export const aiPreferencesSchema = z.object({
  /** Morning digest at 08:30 via notifications. */
  morningDigest: z.boolean().optional(),
  /**
   * Which saved connection turns Telegram voice messages into text (its `/audio/transcriptions`).
   * `null` — the first OpenAI connection.
   */
  speechConnectionId: z.uuid().nullable().optional(),
  speechModel: z.string().trim().min(1).max(100).optional(),
});
export type AiPreferences = z.infer<typeof aiPreferencesSchema>;

export interface AiSettings {
  morningDigest: boolean;
  speechConnectionId: string | null;
  speechModel: string;
  /** At least one connection exists — the AI features work. */
  configured: boolean;
  /** The connection every AI request goes through. */
  activeConnectionId: string | null;
  connections: AiConnection[];
}

/**
 * Files the assistant can read: the server extracts their text (bank statements, receipts,
 * price lists…) and the model gets it as part of the message. Images are not supported —
 * not every provider has a vision model.
 */
export const AI_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.ofx',
  '.qif',
] as const;
/** Telegram bots can download files up to 20 MB; the web upload uses the same limit. */
export const AI_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
/** Extracted text is cut to this length so a file fits into the model context. */
export const AI_ATTACHMENT_MAX_CHARS = 60_000;
export const AI_MAX_ATTACHMENTS = 3;

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

export interface AiConversationDetail extends AiConversation {
  messages: AiStoredMessage[];
}
