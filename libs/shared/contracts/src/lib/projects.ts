import { z } from 'zod';

/**
 * A project is a site or service you run (for example, ai-text-guard.com).
 * It is a shared core entity: finance references it, and later analytics, uptime, etc.
 */
export const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().nullish(),
  description: z.string().max(1000).nullish(),
  /**
   * Other names the project goes by in the sections: its repository (`owner/name` or `name`),
   * its folder in an IDE (the project of WakaTime). Its own name always counts.
   */
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

export interface Project {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  aliases: string[];
  createdAt: string;
}
