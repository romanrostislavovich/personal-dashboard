import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import {
  addDays,
  DateParts,
  daysInMonth,
  DiaryCalendarDay,
  DiaryEntry,
  DiaryEntryInput,
  DiaryInsights,
  DiaryMarkHit,
  DiaryMemory,
  DiaryQuery,
  DiarySearchHit,
  DiarySettings,
  DiaryStats,
  LocalDate,
  parseDiaryMarks,
  parseLocalDate,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import { and, arrayContains, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { appendNote, extractTags, searchSnippet, shorten, toPlainText } from './diary-text';
import { DiaryEntryRow, diaryEntries, diarySettings } from './diary.schema';
import { computeStreaks } from './streaks';

const MOOD_HISTORY_DAYS = 30;
const TOP_TAGS_LIMIT = 10;
const TOP_MARKS_LIMIT = 12;
const SEARCH_LIMIT = 50;
const MEMORY_PREVIEW_LENGTH = 200;
/** A tag needs this many rated days before its average mood means anything. */
const TAG_MOOD_MIN_DAYS = 3;

/** Word count in SQL; an empty entry has 0 words, not 1. */
const wordCount = sql<number>`CASE WHEN btrim(${diaryEntries.content}) = '' THEN 0
  ELSE array_length(regexp_split_to_array(btrim(${diaryEntries.content}), '\\s+'), 1) END`;

@Injectable()
export class DiaryService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  async list(userId: string, { from, to, tag }: DiaryQuery): Promise<DiaryEntry[]> {
    const rows = await this.db
      .select()
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          gte(diaryEntries.day, from),
          lte(diaryEntries.day, to),
          tag ? arrayContains(diaryEntries.tags, [tag.toLowerCase()]) : undefined,
        ),
      )
      .orderBy(desc(diaryEntries.day));
    return rows.map(toEntry);
  }

  async get(userId: string, day: LocalDate): Promise<DiaryEntry | null> {
    const row = await this.findRow(userId, day);
    return row ? toEntry(row) : null;
  }

  /** Saves the day's entry. An empty entry without a mood is deleted. */
  async save(userId: string, day: LocalDate, input: DiaryEntryInput): Promise<DiaryEntry | null> {
    const content = input.content;
    const mood = input.mood ?? null;
    if (!content.trim() && mood === null) {
      await this.remove(userId, day);
      return null;
    }
    const values = {
      content,
      mood,
      tags: extractTags(content),
      marks: parseDiaryMarks(content),
      updatedAt: new Date(),
    };
    const [row] = await this.db
      .insert(diaryEntries)
      .values({ userId, day, ...values })
      .onConflictDoUpdate({ target: [diaryEntries.userId, diaryEntries.day], set: values })
      .returning();
    return toEntry(row);
  }

  async remove(userId: string, day: LocalDate): Promise<void> {
    await this.db
      .delete(diaryEntries)
      .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.day, day)));
  }

  /** Appends a note to today's entry (used by the Telegram commands). */
  async appendToToday(userId: string, note: string): Promise<void> {
    const timeZone = this.timeZone();
    const day = this.todayDate();
    const time = new Intl.DateTimeFormat('ru', { timeZone, timeStyle: 'short' }).format(new Date());
    const existing = await this.findRow(userId, day);
    await this.save(userId, day, {
      content: appendNote(existing?.content ?? '', note, time),
      mood: existing?.mood ?? null,
    });
  }

  /** Sets today's mood, keeping the text (Telegram `/mood`). */
  async setTodayMood(userId: string, mood: number): Promise<void> {
    const day = this.todayDate();
    const existing = await this.findRow(userId, day);
    await this.save(userId, day, { content: existing?.content ?? '', mood });
  }

  async todayEntry(userId: string): Promise<DiaryEntry | null> {
    return this.get(userId, this.todayDate());
  }

  async stats(userId: string): Promise<DiaryStats> {
    const today = this.today();
    const days = await this.db
      .select({ day: diaryEntries.day })
      .from(diaryEntries)
      .where(eq(diaryEntries.userId, userId));
    const streaks = computeStreaks(
      days.map((d) => d.day),
      today,
    );

    const moodHistory = await this.db
      .select({ day: diaryEntries.day, mood: diaryEntries.mood })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          isNotNull(diaryEntries.mood),
          gte(diaryEntries.day, toLocalDate(addDays(today, -MOOD_HISTORY_DAYS))),
        ),
      )
      .orderBy(asc(diaryEntries.day));

    // unnest expands the tag array into rows so they can be counted.
    const topTags = await this.db.execute<{ tag: string; count: number }>(sql`
      SELECT tag, count(*)::int AS count
      FROM ${diaryEntries}, unnest(${diaryEntries.tags}) AS tag
      WHERE ${diaryEntries.userId} = ${userId}
      GROUP BY tag
      ORDER BY count DESC, tag
      LIMIT ${TOP_TAGS_LIMIT}
    `);

    // Same for marks: one row per marked fragment.
    const topMarks = await this.db.execute<{ emoji: string; count: number }>(sql`
      SELECT mark ->> 'emoji' AS emoji, count(*)::int AS count
      FROM ${diaryEntries}, jsonb_array_elements(${diaryEntries.marks}) AS mark
      WHERE ${diaryEntries.userId} = ${userId}
      GROUP BY 1
      ORDER BY count DESC
      LIMIT ${TOP_MARKS_LIMIT}
    `);

    return {
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      totalEntries: days.length,
      hasEntryToday: days.some((d) => d.day === toLocalDate(today)),
      moodHistory: moodHistory.map((row) => ({ day: row.day, mood: row.mood as number })),
      topTags: topTags.rows,
      topMarks: topMarks.rows,
    };
  }

  /** Every fragment marked with `emoji`, newest days first. */
  async marks(userId: string, emoji: string): Promise<DiaryMarkHit[]> {
    const rows = await this.db
      .select({ day: diaryEntries.day, marks: diaryEntries.marks })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          sql`${diaryEntries.marks} @> ${JSON.stringify([{ emoji }])}::jsonb`,
        ),
      )
      .orderBy(desc(diaryEntries.day));
    return rows.flatMap((row) =>
      row.marks
        .filter((mark) => mark.emoji === emoji)
        .map((mark) => ({ day: row.day, emoji: mark.emoji, text: mark.text })),
    );
  }

  /** Case-insensitive substring search over all entries. */
  async search(userId: string, query: string): Promise<DiarySearchHit[]> {
    // `%` and `_` from the user are literal characters, not wildcards.
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db
      .select({ day: diaryEntries.day, mood: diaryEntries.mood, content: diaryEntries.content })
      .from(diaryEntries)
      .where(and(eq(diaryEntries.userId, userId), sql`${diaryEntries.content} ILIKE ${pattern}`))
      .orderBy(desc(diaryEntries.day))
      .limit(SEARCH_LIMIT);
    return rows.map((row) => ({
      day: row.day,
      mood: row.mood,
      snippet: searchSnippet(row.content, query),
    }));
  }

  /** Days of a year with an entry — for the heatmap. */
  async calendar(userId: string, year: number): Promise<DiaryCalendarDay[]> {
    const rows = await this.db
      .select({ day: diaryEntries.day, mood: diaryEntries.mood, words: wordCount })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          gte(diaryEntries.day, `${year}-01-01`),
          lte(diaryEntries.day, `${year}-12-31`),
        ),
      )
      .orderBy(asc(diaryEntries.day));
    return rows.map((row) => ({ day: row.day, mood: row.mood, words: Number(row.words) }));
  }

  /** "On this day": the same date a month ago and in every previous year. */
  async memories(userId: string, day: LocalDate): Promise<DiaryMemory[]> {
    const monthAgo = toLocalDate(addMonths(parseLocalDate(day), -1));
    const rows = await this.db
      .select({ day: diaryEntries.day, mood: diaryEntries.mood, content: diaryEntries.content })
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          sql`(${diaryEntries.day} = ${monthAgo}
            OR (to_char(${diaryEntries.day}, 'MM-DD') = ${day.slice(5)} AND ${diaryEntries.day} < ${day}))`,
        ),
      )
      .orderBy(desc(diaryEntries.day));
    return rows.map((row) => ({
      day: row.day,
      mood: row.mood,
      preview: shorten(toPlainText(row.content), MEMORY_PREVIEW_LENGTH),
    }));
  }

  async insights(userId: string): Promise<DiaryInsights> {
    const weekdays = await this.db.execute<{
      weekday: number;
      average: number | null;
      count: number;
    }>(sql`
      SELECT extract(isodow FROM ${diaryEntries.day})::int AS weekday,
             avg(${diaryEntries.mood})::float AS average,
             count(${diaryEntries.mood})::int AS count
      FROM ${diaryEntries}
      WHERE ${diaryEntries.userId} = ${userId}
      GROUP BY 1
    `);
    const byWeekday = new Map(weekdays.rows.map((row) => [row.weekday, row]));

    const tagMoods = await this.db.execute<{ tag: string; average: number; count: number }>(sql`
      SELECT tag, avg(${diaryEntries.mood})::float AS average, count(*)::int AS count
      FROM ${diaryEntries}, unnest(${diaryEntries.tags}) AS tag
      WHERE ${diaryEntries.userId} = ${userId} AND ${diaryEntries.mood} IS NOT NULL
      GROUP BY tag
      HAVING count(*) >= ${TAG_MOOD_MIN_DAYS}
      ORDER BY average DESC, count DESC
    `);

    return {
      moodByWeekday: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        average: byWeekday.get(weekday)?.average ?? null,
        count: byWeekday.get(weekday)?.count ?? 0,
      })),
      tagMoods: tagMoods.rows,
    };
  }

  async getSettings(userId: string): Promise<DiarySettings> {
    const [row] = await this.db
      .select()
      .from(diarySettings)
      .where(eq(diarySettings.userId, userId));
    return {
      eveningReminder: row?.eveningReminder ?? false,
      weeklySummary: row?.weeklySummary ?? false,
      template: row?.template ?? null,
    };
  }

  async saveSettings(userId: string, settings: DiarySettings): Promise<DiarySettings> {
    const values = { ...settings, template: settings.template?.trim() || null };
    await this.db
      .insert(diarySettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: diarySettings.userId, set: values });
    return values;
  }

  /** Users due a reminder: reminder enabled and no entry for today. */
  async usersToRemind(): Promise<string[]> {
    const today = this.todayDate();
    const rows = await this.db
      .select({ userId: diarySettings.userId })
      .from(diarySettings)
      .leftJoin(
        diaryEntries,
        and(eq(diaryEntries.userId, diarySettings.userId), eq(diaryEntries.day, today)),
      )
      .where(and(eq(diarySettings.eveningReminder, true), sql`${diaryEntries.id} IS NULL`));
    return rows.map((row) => row.userId);
  }

  async usersWithWeeklySummary(): Promise<string[]> {
    const rows = await this.db
      .select({ userId: diarySettings.userId })
      .from(diarySettings)
      .where(eq(diarySettings.weeklySummary, true));
    return rows.map((row) => row.userId);
  }

  /** The last 7 days, including today. */
  lastWeek(): { from: LocalDate; to: LocalDate } {
    const today = this.today();
    return { from: toLocalDate(addDays(today, -6)), to: toLocalDate(today) };
  }

  todayDate(): LocalDate {
    return toLocalDate(this.today());
  }

  private async findRow(userId: string, day: LocalDate): Promise<DiaryEntryRow | undefined> {
    const [row] = await this.db
      .select()
      .from(diaryEntries)
      .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.day, day)));
    return row;
  }

  private timeZone(): string {
    return this.config.get('APP_TIMEZONE', { infer: true });
  }

  private today(): DateParts {
    return todayIn(this.timeZone());
  }
}

/** The same day `months` months later; the 31st becomes the last day of a shorter month. */
function addMonths(date: DateParts, months: number): DateParts {
  const target = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function toEntry(row: DiaryEntryRow): DiaryEntry {
  return {
    day: row.day,
    content: row.content,
    mood: row.mood,
    tags: row.tags,
    marks: row.marks,
    updatedAt: row.updatedAt.toISOString(),
  };
}
