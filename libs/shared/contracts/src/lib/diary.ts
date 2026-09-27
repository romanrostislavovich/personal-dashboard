import { z } from 'zod';
import { LocalDate } from './local-date';

export const MOODS = [1, 2, 3, 4, 5] as const;

export const diaryEntryInputSchema = z.object({
  /** Markdown. Tags (#work, #sport) are extracted from the text automatically. */
  content: z.string().max(50_000),
  /** 1 — very bad … 5 — great; null — not set. */
  mood: z.number().int().min(1).max(5).nullish(),
});
export type DiaryEntryInput = z.infer<typeof diaryEntryInputSchema>;

export const diaryQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  tag: z.string().trim().min(1).optional(),
});
export type DiaryQuery = z.infer<typeof diaryQuerySchema>;

export interface DiaryEntry {
  day: LocalDate;
  content: string;
  mood: number | null;
  tags: string[];
  updatedAt: string;
}

export interface DiaryStats {
  /** Consecutive days with an entry, including today (or yesterday if nothing was written today yet). */
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  hasEntryToday: boolean;
  /** Mood per day for the last 30 days (only days with a rating). */
  moodHistory: { day: LocalDate; mood: number }[];
  /** Most frequent tags. */
  topTags: { tag: string; count: number }[];
}

export const diarySettingsSchema = z.object({
  /** Reminder at 21:00 if there is no entry for the day. */
  eveningReminder: z.boolean(),
  /** AI summary of the week on Sundays at 20:00 (if the AI is configured). */
  weeklySummary: z.boolean(),
});
export type DiarySettings = z.infer<typeof diarySettingsSchema>;

export const diarySummaryRequestSchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type DiarySummaryRequest = z.infer<typeof diarySummaryRequestSchema>;

export interface DiarySummary {
  /** `null` — no entries for the period. */
  summary: string | null;
}
