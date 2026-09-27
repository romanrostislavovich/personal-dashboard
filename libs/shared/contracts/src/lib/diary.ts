import { z } from 'zod';
import { DiaryMark } from './diary-marks';
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
  /** Fragments marked with an emoji (`==🔥 text==`). */
  marks: DiaryMark[];
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
  /** Emojis used in marks, most frequent first. */
  topMarks: { emoji: string; count: number }[];
}

export const diarySettingsSchema = z.object({
  /** Reminder at 21:00 if there is no entry for the day. */
  eveningReminder: z.boolean(),
  /** AI summary of the week on Sundays at 20:00 (if the AI is configured). */
  weeklySummary: z.boolean(),
  /** Inserted into an empty day with one click; `null` — no template. */
  template: z.string().max(5_000).nullable(),
});
export type DiarySettings = z.infer<typeof diarySettingsSchema>;

export const diarySummaryRequestSchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type DiarySummaryRequest = z.infer<typeof diarySummaryRequestSchema>;

export interface DiarySummary {
  /** `null` — no entries for the period. */
  summary: string | null;
}

/** A marked fragment found across all entries. */
export interface DiaryMarkHit {
  day: LocalDate;
  emoji: string;
  text: string;
}

export const diaryMarksQuerySchema = z.object({ emoji: z.string().min(1).max(32) });

export const diarySearchQuerySchema = z.object({ q: z.string().trim().min(2).max(200) });
export type DiarySearchQuery = z.infer<typeof diarySearchQuerySchema>;

export interface DiarySearchHit {
  day: LocalDate;
  mood: number | null;
  /** Plain text around the first match. */
  snippet: string;
}

export const diaryCalendarQuerySchema = z.object({
  year: z.coerce.number().int().min(1970).max(2100),
});

/** One cell of the year heatmap. */
export interface DiaryCalendarDay {
  day: LocalDate;
  mood: number | null;
  /** Number of words — to tell a short note from a long entry. */
  words: number;
}

/** Entries from the same date a month ago and in previous years. */
export interface DiaryMemory {
  day: LocalDate;
  mood: number | null;
  preview: string;
}

export interface DiaryInsights {
  /** ISO weekday: 1 — Monday … 7 — Sunday; `average` is `null` without rated days. */
  moodByWeekday: { weekday: number; average: number | null; count: number }[];
  /** Average mood of days with the tag (tags used on at least 3 rated days). */
  tagMoods: { tag: string; average: number; count: number }[];
}

export interface DiaryPhoto {
  id: string;
  day: LocalDate;
  mimeType: string;
  size: number;
  caption: string | null;
  createdAt: string;
}

/** Photos are stored in PostgreSQL, so a regular database backup includes them. */
export const DIARY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const DIARY_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
