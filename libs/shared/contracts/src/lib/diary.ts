import { z } from 'zod';
import { LocalDate } from './local-date';

export const MOODS = [1, 2, 3, 4, 5] as const;

export const diaryEntryInputSchema = z.object({
  /** Markdown. Теги (#работа, #спорт) извлекаются из текста автоматически. */
  content: z.string().max(50_000),
  /** 1 — очень плохо … 5 — отлично; null — не указано. */
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
  /** Дней подряд с записью, включая сегодня (или вчера, если сегодня ещё не писал). */
  currentStreak: number;
  longestStreak: number;
  totalEntries: number;
  hasEntryToday: boolean;
  /** Настроение по дням за последние 30 дней (только дни с оценкой). */
  moodHistory: { day: LocalDate; mood: number }[];
  /** Самые частые теги. */
  topTags: { tag: string; count: number }[];
}

export const diarySettingsSchema = z.object({
  /** Напоминание в 21:00, если за день нет записи. */
  eveningReminder: z.boolean(),
  /** Саммари недели от AI по воскресеньям в 20:00 (если AI настроен). */
  weeklySummary: z.boolean(),
});
export type DiarySettings = z.infer<typeof diarySettingsSchema>;

export const diarySummaryRequestSchema = z.object({ from: z.iso.date(), to: z.iso.date() });
export type DiarySummaryRequest = z.infer<typeof diarySummaryRequestSchema>;

export interface DiarySummary {
  /** `null` — за период нет записей. */
  summary: string | null;
}
