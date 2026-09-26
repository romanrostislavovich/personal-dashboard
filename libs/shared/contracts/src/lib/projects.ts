import { z } from 'zod';

/**
 * Проект — сайт или сервис, который ты запускаешь (например, ai-text-guard.com).
 * Это общая сущность ядра: на неё ссылаются финансы, а позже аналитика, uptime и т.д.
 */
export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().nullish(),
  description: z.string().max(1000).nullish(),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export interface Project {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  createdAt: string;
}
