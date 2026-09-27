import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database } from '@pd/api-core';
import {
  addDays,
  DateParts,
  DiaryEntry,
  DiaryEntryInput,
  DiaryQuery,
  DiarySettings,
  DiaryStats,
  LocalDate,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import { and, arrayContains, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { appendNote, extractTags } from './diary-text';
import { DiaryEntryRow, diaryEntries, diarySettings } from './diary.schema';
import { computeStreaks } from './streaks';

const MOOD_HISTORY_DAYS = 30;
const TOP_TAGS_LIMIT = 10;

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

  /** Сохраняет запись дня. Пустая запись без настроения удаляется. */
  async save(userId: string, day: LocalDate, input: DiaryEntryInput): Promise<DiaryEntry | null> {
    const content = input.content;
    const mood = input.mood ?? null;
    if (!content.trim() && mood === null) {
      await this.remove(userId, day);
      return null;
    }
    const values = { content, mood, tags: extractTags(content), updatedAt: new Date() };
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

  /** Дописывает заметку в сегодняшнюю запись (используется Telegram-командой). */
  async appendToToday(userId: string, note: string): Promise<void> {
    const timeZone = this.timeZone();
    const day = toLocalDate(todayIn(timeZone));
    const time = new Intl.DateTimeFormat('ru', { timeZone, timeStyle: 'short' }).format(new Date());
    const existing = await this.findRow(userId, day);
    await this.save(userId, day, {
      content: appendNote(existing?.content ?? '', note, time),
      mood: existing?.mood ?? null,
    });
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

    // unnest разворачивает массив тегов в строки, чтобы их можно было посчитать.
    const topTags = await this.db.execute<{ tag: string; count: number }>(sql`
      SELECT tag, count(*)::int AS count
      FROM ${diaryEntries}, unnest(${diaryEntries.tags}) AS tag
      WHERE ${diaryEntries.userId} = ${userId}
      GROUP BY tag
      ORDER BY count DESC, tag
      LIMIT ${TOP_TAGS_LIMIT}
    `);

    return {
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      totalEntries: days.length,
      hasEntryToday: days.some((d) => d.day === toLocalDate(today)),
      moodHistory: moodHistory.map((row) => ({ day: row.day, mood: row.mood as number })),
      topTags: topTags.rows,
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
    };
  }

  async saveSettings(userId: string, settings: DiarySettings): Promise<DiarySettings> {
    await this.db
      .insert(diarySettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({ target: diarySettings.userId, set: settings });
    return settings;
  }

  /** Пользователи, которым пора напомнить: напоминание включено, а записи за сегодня нет. */
  async usersToRemind(): Promise<string[]> {
    const today = toLocalDate(this.today());
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

  /** Последние 7 дней, включая сегодня. */
  lastWeek(): { from: LocalDate; to: LocalDate } {
    const today = this.today();
    return { from: toLocalDate(addDays(today, -6)), to: toLocalDate(today) };
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

function toEntry(row: DiaryEntryRow): DiaryEntry {
  return {
    day: row.day,
    content: row.content,
    mood: row.mood,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
  };
}
