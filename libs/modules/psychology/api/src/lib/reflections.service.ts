import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiService, DB, Database, NotificationsService, UsersService } from '@pd/api-core';
import {
  addDays,
  LocalDate,
  parseLocalDate,
  PsychologyReflection,
  PsychologySettings,
  PsychologySettingsInput,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { psychologyMessages } from './psychology.messages';
import { psychologyReflections, psychologySettings } from './psychology.schema';

const QUESTIONS = 3;
const MAX_QUESTION = 300;

/** The Monday of the week a day is in. */
export function mondayOf(day: LocalDate): LocalDate {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return toLocalDate(addDays(parseLocalDate(day), -weekday));
}

/**
 * The questions out of the model's answer: one a line, numbering and bullets taken off.
 * `null` — the answer is not a list of questions (the model refused or wrote something else).
 */
export function parseQuestions(reply: string): string[] | null {
  const questions = reply
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.endsWith('?') && line.length <= MAX_QUESTION);
  return questions.length >= 2 ? questions.slice(0, QUESTIONS) : null;
}

/**
 * Reflection: a few questions about the week, answered in the user's own words. With an AI
 * connected the questions are written from the week's own data (the model looks through the
 * sections with its reading tools); without one, or when it fails, the standard three are asked.
 */
@Injectable()
export class ReflectionsService {
  private readonly logger = new Logger(ReflectionsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string): Promise<PsychologyReflection[]> {
    const rows = await this.db
      .select()
      .from(psychologyReflections)
      .where(eq(psychologyReflections.userId, userId))
      .orderBy(desc(psychologyReflections.week));
    return rows.map(toReflection);
  }

  /** The questions of the current week: made once, the same on every later call. */
  async forThisWeek(userId: string): Promise<PsychologyReflection> {
    const user = await this.users.findById(userId);
    const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    const week = mondayOf(today);
    const [existing] = await this.db
      .select()
      .from(psychologyReflections)
      .where(and(eq(psychologyReflections.userId, userId), eq(psychologyReflections.week, week)));
    if (existing) {
      return toReflection(existing);
    }
    const asked = await this.askAi(userId, week, today, user?.locale);
    const [row] = await this.db
      .insert(psychologyReflections)
      .values({
        userId,
        week,
        questions: asked ?? psychologyMessages(user?.locale).standardQuestions,
        byAi: asked !== null,
      })
      // Two requests at once: the first one wins, the second reads its questions.
      .onConflictDoNothing()
      .returning();
    return row ? toReflection(row) : this.forThisWeek(userId);
  }

  async answer(userId: string, id: string, answers: string[]): Promise<PsychologyReflection> {
    const [row] = await this.db
      .update(psychologyReflections)
      .set({ answers })
      .where(and(eq(psychologyReflections.id, id), eq(psychologyReflections.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toReflection(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(psychologyReflections)
      .where(and(eq(psychologyReflections.id, id), eq(psychologyReflections.userId, userId)));
  }

  async settings(userId: string): Promise<PsychologySettings> {
    const [row] = await this.db
      .select()
      .from(psychologySettings)
      .where(eq(psychologySettings.userId, userId));
    return { weeklyReview: row?.weeklyReview ?? false, birthYear: row?.birthYear ?? null };
  }

  /** Only what is given is changed. */
  async saveSettings(userId: string, settings: PsychologySettingsInput): Promise<void> {
    if (!Object.keys(settings).length) {
      return;
    }
    await this.db
      .insert(psychologySettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({ target: psychologySettings.userId, set: settings });
  }

  /** Sunday evening: the questions of the week for everybody who asked for them. */
  async sendWeekly(): Promise<void> {
    const wanted = await this.db
      .select({ userId: psychologySettings.userId })
      .from(psychologySettings)
      .where(eq(psychologySettings.weeklyReview, true));
    for (const { userId } of wanted) {
      try {
        const reflection = await this.forThisWeek(userId);
        // Answered already (the user opened the page first): nothing to remind of.
        if (reflection.answers.some((answer) => answer.trim())) {
          continue;
        }
        const text = psychologyMessages((await this.users.findById(userId))?.locale);
        await this.notifications.send(userId, {
          title: text.reviewTitle,
          body: text.reviewBody(reflection.questions),
          source: 'psychology',
        });
      } catch (error) {
        this.logger.warn(`Weekly questions were not sent: ${String(error).slice(0, 200)}`);
      }
    }
  }

  /** `null` — there is no AI, or it did not give questions. */
  private async askAi(
    userId: string,
    week: LocalDate,
    today: LocalDate,
    locale: string | undefined,
  ): Promise<string[] | null> {
    if (!(await this.ai.isConfigured(userId))) {
      return null;
    }
    try {
      const { reply } = await this.ai.ask(
        userId,
        [
          {
            role: 'user',
            content:
              `Look at my week from ${week} to ${today} with the tools: the diary and its mood, ` +
              'the time at the computer, tasks, money, music, events and notes of Psychology. ' +
              `Then write exactly ${QUESTIONS} short questions for my own reflection on this ` +
              'week. Base each on something specific you saw (a low day, a long work day, a ' +
              'finished task, an event) and name it. Open questions that invite thought, not ' +
              'advice, not a diagnosis, no judgement. Answer with the questions only, one a ' +
              `line, each ending with a question mark, in ${psychologyMessages(locale).aiLanguage}.`,
          },
        ],
        { plainText: true },
      );
      return parseQuestions(reply);
    } catch (error) {
      this.logger.warn(`The AI did not write the questions: ${String(error).slice(0, 200)}`);
      return null;
    }
  }
}

function toReflection(row: typeof psychologyReflections.$inferSelect): PsychologyReflection {
  return {
    id: row.id,
    week: row.week,
    questions: row.questions,
    // One answer a question, whatever was saved.
    answers: row.questions.map((_, index) => row.answers[index] ?? ''),
    byAi: row.byAi,
    createdAt: row.createdAt.toISOString(),
  };
}
