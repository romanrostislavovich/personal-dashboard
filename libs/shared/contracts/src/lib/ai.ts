import { z } from 'zod';

/**
 * Any OpenAI-compatible API. Presets fill in the default address and model,
 * `custom` — your own address (OpenRouter, LM Studio, a proxy…).
 */
export const AI_PROVIDERS = ['deepseek', 'openai', 'ollama', 'custom'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_PRESETS: Record<AiProvider, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: '' },
  custom: { baseUrl: '', model: '' },
};

export const aiSettingsInputSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.url(),
  model: z.string().trim().min(1).max(100),
  /** Empty — keep the saved key (Ollama has no key at all). */
  apiKey: z.string().trim().max(500).optional(),
  /** Morning digest at 08:30 via notifications. */
  morningDigest: z.boolean(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsInputSchema>;

export interface AiSettings {
  configured: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  morningDigest: boolean;
}

export const aiChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(20_000),
      }),
    )
    .min(1)
    .max(40),
});
export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type AiChatMessage = AiChatRequest['messages'][number];

export interface AiChatResponse {
  reply: string;
  /** Which data the model requested — shown under the answer. */
  toolsUsed: string[];
}
