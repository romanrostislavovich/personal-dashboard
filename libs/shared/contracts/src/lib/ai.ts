import { z } from 'zod';

/**
 * Любой OpenAI-совместимый API. Пресеты подставляют адрес и модель по умолчанию,
 * `custom` — свой адрес (OpenRouter, LM Studio, прокси…).
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
  /** Пусто — оставить сохранённый ключ (у Ollama ключа нет вовсе). */
  apiKey: z.string().trim().max(500).optional(),
  /** Утренний дайджест в 08:30 через уведомления. */
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
  /** Какие данные модель запрашивала — показываем под ответом. */
  toolsUsed: string[];
}
