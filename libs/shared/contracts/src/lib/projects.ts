import { z } from 'zod';

/**
 * A project is a site or service you run (for example, ai-text-guard.com).
 * It is a shared core entity: finance references it, and later analytics, uptime, etc.
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
