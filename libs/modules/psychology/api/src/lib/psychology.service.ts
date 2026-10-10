import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database, LinksService, MOOD_METRIC, UsersService } from '@pd/api-core';
import {
  compareEvents,
  EventExportFormat,
  eventTouches,
  LocalDate,
  psychologyAssessmentInputSchema,
  PsychologyAssessment,
  PsychologyAssessmentInput,
  PsychologyEvent,
  psychologyEventInputSchema,
  PsychologyNote,
  PsychologyNoteInput,
  PsychologyPatterns,
  QUESTIONNAIRES,
  questionnaireBand,
  zonedDateTime,
} from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ExportTable, toDocx, toXlsx } from './events-export';
import { moodPatterns } from './patterns';
import { feelingText, psychologyMessages } from './psychology.messages';
import {
  PsychologyAssessmentRow,
  psychologyAssessments,
  PsychologyEventRow,
  psychologyEvents,
  psychologyNotes,
  psychologySettings,
} from './psychology.schema';

export type ValidEventInput = z.output<typeof psychologyEventInputSchema>;

const MIME: Record<EventExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Psychology: notes about oneself, the events of a life, questionnaires taken over time, and
 * the patterns of the mood. The mood itself is the diary's — the core tells it day by day.
 */
@Injectable()
export class PsychologyService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly users: UsersService,
  ) {}

  // --- Notes ---

  async notes(userId: string): Promise<PsychologyNote[]> {
    const rows = await this.db
      .select()
      .from(psychologyNotes)
      .where(eq(psychologyNotes.userId, userId))
      .orderBy(desc(psychologyNotes.day), desc(psychologyNotes.createdAt));
    return rows.map(({ id, day, text, createdAt }) => ({
      id,
      day,
      text,
      createdAt: createdAt.toISOString(),
    }));
  }

  async addNote(userId: string, input: PsychologyNoteInput): Promise<void> {
    await this.db.insert(psychologyNotes).values({ userId, ...input });
  }

  async updateNote(userId: string, id: string, input: PsychologyNoteInput): Promise<void> {
    const updated = await this.db
      .update(psychologyNotes)
      .set(input)
      .where(and(eq(psychologyNotes.id, id), eq(psychologyNotes.userId, userId)))
      .returning({ id: psychologyNotes.id });
    if (!updated.length) {
      throw new NotFoundException();
    }
  }

  async removeNote(userId: string, id: string): Promise<void> {
    await this.db
      .delete(psychologyNotes)
      .where(and(eq(psychologyNotes.id, id), eq(psychologyNotes.userId, userId)));
  }

  // --- Events ---

  /** The events that touch the period (all of them without one), the latest first. */
  async events(
    userId: string,
    period: { from?: LocalDate; to?: LocalDate } = {},
  ): Promise<PsychologyEvent[]> {
    const rows = await this.db
      .select()
      .from(psychologyEvents)
      .where(eq(psychologyEvents.userId, userId));
    // An event told by age is placed in time by the year of birth, so the period and the
    // order are worked out here rather than in the query; a life has few enough events.
    const birthYear = await this.birthYear(userId);
    return rows
      .map(toEvent)
      .filter((event) => eventTouches(event, birthYear, period))
      .sort(compareEvents(birthYear));
  }

  private async birthYear(userId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ birthYear: psychologySettings.birthYear })
      .from(psychologySettings)
      .where(eq(psychologySettings.userId, userId));
    return row?.birthYear ?? null;
  }

  async addEvent(userId: string, input: ValidEventInput): Promise<PsychologyEvent> {
    const [row] = await this.db
      .insert(psychologyEvents)
      .values({ userId, ...stored(input) })
      .returning();
    return toEvent(row);
  }

  async updateEvent(userId: string, id: string, input: ValidEventInput): Promise<PsychologyEvent> {
    const [row] = await this.db
      .update(psychologyEvents)
      .set(stored(input))
      .where(and(eq(psychologyEvents.id, id), eq(psychologyEvents.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toEvent(row);
  }

  async removeEvent(userId: string, id: string): Promise<void> {
    await this.db
      .delete(psychologyEvents)
      .where(and(eq(psychologyEvents.id, id), eq(psychologyEvents.userId, userId)));
  }

  /** The events of a period as an Excel workbook or a Word document, in the user's language. */
  async exportEvents(
    userId: string,
    format: EventExportFormat,
    period: { from?: LocalDate; to?: LocalDate },
  ): Promise<{ file: Buffer; name: string; type: string }> {
    const user = await this.users.findById(userId);
    const text = psychologyMessages(user?.locale);
    const events = (await this.events(userId, period)).reverse(); // The earliest first: a story.
    const table: ExportTable = {
      title: text.eventsTitle,
      subtitle:
        period.from || period.to
          ? text.eventsPeriod(period.from ?? '…', period.to ?? '…')
          : text.eventsAll,
      headers: text.eventsHeaders,
      rows: events.map((event) => [
        event.startedOn ?? text.age(event.ageFrom ?? 0, event.ageTo),
        event.endedOn ?? text.ongoing,
        event.title,
        feelingText(user?.locale, event.feeling),
        event.description ?? '',
      ]),
    };
    const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    return {
      file: format === 'xlsx' ? toXlsx(table) : toDocx(table),
      name: `events-${today}.${format}`,
      type: MIME[format],
    };
  }

  // --- Check-ups ---

  /** Every filled-in questionnaire, the latest first. */
  async assessments(userId: string): Promise<PsychologyAssessment[]> {
    const a = psychologyAssessments;
    const rows = await this.db
      .select()
      .from(a)
      .where(eq(a.userId, userId))
      .orderBy(desc(a.takenOn), desc(a.createdAt));
    return rows.flatMap((row) => toAssessment(row) ?? []);
  }

  async addAssessment(
    userId: string,
    input: PsychologyAssessmentInput,
  ): Promise<PsychologyAssessment> {
    const [row] = await this.db
      .insert(psychologyAssessments)
      .values({ userId, ...psychologyAssessmentInputSchema.parse(input) })
      .returning();
    return toAssessment(row) as PsychologyAssessment;
  }

  async removeAssessment(userId: string, id: string): Promise<void> {
    await this.db
      .delete(psychologyAssessments)
      .where(and(eq(psychologyAssessments.id, id), eq(psychologyAssessments.userId, userId)));
  }

  // --- Patterns ---

  /** The mood over a period: by weekday, by week, low runs, and during the events. */
  async patterns(
    userId: string,
    period: { from: LocalDate; to: LocalDate },
  ): Promise<PsychologyPatterns> {
    // The mood is the diary's: the core tells it.
    const mood = await this.links.dailyMetric(userId, MOOD_METRIC, period);
    // Only the dated events: an age does not say which days.
    const events = (await this.events(userId, period)).flatMap((event) =>
      event.startedOn ? { ...event, startedOn: event.startedOn } : [],
    );
    return moodPatterns(mood?.days ?? [], events, period);
  }
}

function stored(input: ValidEventInput) {
  return {
    title: input.title,
    description: input.description || null,
    startedOn: input.startedOn ?? null,
    endedOn: input.endedOn && input.endedOn !== input.startedOn ? input.endedOn : null,
    ageFrom: input.ageFrom ?? null,
    ageTo: input.ageTo != null && input.ageTo !== input.ageFrom ? input.ageTo : null,
    feeling: input.feeling,
  };
}

function toEvent(row: PsychologyEventRow): PsychologyEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
    ageFrom: row.ageFrom,
    ageTo: row.ageTo,
    feeling: row.feeling,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `null` for a questionnaire that is not known any more. */
function toAssessment(row: PsychologyAssessmentRow): PsychologyAssessment | null {
  const questionnaire = QUESTIONNAIRES.find((item) => item.id === row.test);
  if (!questionnaire) {
    return null;
  }
  const sum = row.answers.reduce((total, answer) => total + answer, 0);
  return {
    id: row.id,
    test: row.test,
    takenOn: row.takenOn,
    answers: row.answers,
    sum,
    score: sum * questionnaire.scale,
    band: questionnaireBand(questionnaire, sum),
    care: questionnaire.careItem ? (row.answers[questionnaire.careItem - 1] ?? 0) > 0 : false,
  };
}
