import { z } from 'zod';

export const lifelogDaySchema = z.iso.date();
export const lifelogQuerySchema = z
  .object({
    from: lifelogDaySchema,
    to: lifelogDaySchema,
  })
  .strict()
  .refine(({ from, to }) => {
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    return days >= 0 && days <= 30;
  }, 'Choose at most 31 days');
export type LifelogQuery = z.infer<typeof lifelogQuerySchema>;

export const lifelogNoteSchema = z.object({ note: z.string().trim().max(2000) }).strict();
export type LifelogNote = z.infer<typeof lifelogNoteSchema>;

export const lifelogSettingsSchema = z.object({ enabled: z.boolean() }).strict();
export type LifelogSettings = z.infer<typeof lifelogSettingsSchema>;
export const lifelogAiResultSchema = z
  .object({
    summaryText: z.string().trim().min(1).max(4000),
    keyHighlight: z.string().trim().max(300),
  })
  .strict();

export const lifelogSourceSchema = z
  .object({
    module: z.string().min(1).max(80),
    key: z.string().min(1).max(160),
    at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export const lifelogGeneratedSchema = z
  .object({
    summaryText: z.string().trim().min(1).max(4000),
    keyHighlight: z.string().trim().max(300),
    generatedBy: z.enum(['ai', 'facts']),
    sources: z.array(lifelogSourceSchema).min(1).max(200),
  })
  .strict();
export type LifelogGenerated = z.infer<typeof lifelogGeneratedSchema>;

export interface LifelogNarrative {
  id: string;
  day: string;
  summaryText: string | null;
  keyHighlight: string | null;
  generatedBy: 'ai' | 'facts' | null;
  sources: z.infer<typeof lifelogSourceSchema>[];
  note: string;
  generatedAt: string | null;
  updatedAt: string;
}
