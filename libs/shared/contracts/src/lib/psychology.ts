import { z } from 'zod';
import { LocalDate } from './local-date';

const day = z.iso.date();

// --- Notes: what one noticed about oneself ---

export const psychologyNoteInputSchema = z.object({
  day,
  text: z.string().trim().min(1).max(5000),
});
export type PsychologyNoteInput = z.infer<typeof psychologyNoteInputSchema>;

export interface PsychologyNote extends PsychologyNoteInput {
  id: string;
  createdAt: string;
}

// --- Events: something that happened over a period, or at an age ---

/** How the event felt: from hard (-2) to good (2); `0` — neither. */
export const EVENT_FEELINGS = [-2, -1, 0, 1, 2] as const;
export type EventFeeling = (typeof EVENT_FEELINGS)[number];

const age = z.number().int().min(0).max(120);

/**
 * When an event happened is told one of two ways: by dates (`startedOn`, `endedOn`) or — for
 * what is remembered without them, a childhood above all — by the age in full years
 * (`ageFrom`, `ageTo`).
 */
export const psychologyEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullish(),
    startedOn: day.nullish(),
    /** The last day of it; `null` — one day, or still going on. */
    endedOn: day.nullish(),
    ageFrom: age.nullish(),
    /** The last age of it; `null` — within one year of life. */
    ageTo: age.nullish(),
    feeling: z
      .union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
      .default(0),
  })
  .refine((event) => Boolean(event.startedOn) !== (event.ageFrom != null), {
    message: 'An event has either dates or an age',
    path: ['startedOn'],
  })
  .refine((event) => !event.endedOn || (event.startedOn && event.endedOn >= event.startedOn), {
    message: 'The end is before the start',
    path: ['endedOn'],
  })
  .refine(
    (event) => event.ageTo == null || (event.ageFrom != null && event.ageTo >= event.ageFrom),
    { message: 'The end is before the start', path: ['ageTo'] },
  );
export type PsychologyEventInput = z.input<typeof psychologyEventInputSchema>;

export interface PsychologyEvent {
  id: string;
  title: string;
  description: string | null;
  /** `null` — the event is told by age. */
  startedOn: LocalDate | null;
  endedOn: LocalDate | null;
  /** `null` — the event is told by dates. */
  ageFrom: number | null;
  ageTo: number | null;
  feeling: EventFeeling;
  createdAt: string;
}

type EventTime = Pick<PsychologyEvent, 'startedOn' | 'endedOn' | 'ageFrom' | 'ageTo'>;

/**
 * The days an event covers. One told by age covers the calendar years the user was that old
 * in (a year of life lies across two of them) — known only with the year of birth; `null`
 * without it.
 */
export function eventSpan(
  event: EventTime,
  birthYear: number | null,
): { from: LocalDate; to: LocalDate } | null {
  if (event.startedOn) {
    return { from: event.startedOn, to: event.endedOn ?? event.startedOn };
  }
  if (event.ageFrom == null || birthYear == null) {
    return null;
  }
  return {
    from: `${birthYear + event.ageFrom}-01-01` as LocalDate,
    to: `${birthYear + (event.ageTo ?? event.ageFrom) + 1}-12-31` as LocalDate,
  };
}

/** Whether an event touches the period; one that cannot be placed in time is only in "everything". */
export function eventTouches(
  event: EventTime,
  birthYear: number | null,
  period: { from?: string; to?: string },
): boolean {
  if (!period.from && !period.to) {
    return true;
  }
  const span = eventSpan(event, birthYear);
  return (
    span !== null &&
    (!period.to || span.from <= period.to) &&
    (!period.from || span.to >= period.from)
  );
}

/**
 * The latest first. Events told by age stand where the year of birth puts them; without it
 * they come after the dated ones, the youngest age last.
 */
export function compareEvents(
  birthYear: number | null,
): (a: EventTime & { createdAt: string }, b: EventTime & { createdAt: string }) => number {
  return (a, b) => {
    const [spanA, spanB] = [eventSpan(a, birthYear), eventSpan(b, birthYear)];
    if (spanA && spanB) {
      return spanB.from.localeCompare(spanA.from) || b.createdAt.localeCompare(a.createdAt);
    }
    if (spanA || spanB) {
      return spanA ? -1 : 1;
    }
    return (b.ageFrom ?? 0) - (a.ageFrom ?? 0) || b.createdAt.localeCompare(a.createdAt);
  };
}

export const EVENT_EXPORT_FORMATS = ['xlsx', 'docx'] as const;
export type EventExportFormat = (typeof EVENT_EXPORT_FORMATS)[number];

/** `GET /api/psychology/events/export`: the events that touch the period, as a file. */
export const psychologyEventExportSchema = z.object({
  format: z.enum(EVENT_EXPORT_FORMATS),
  from: day.optional(),
  to: day.optional(),
});
export type PsychologyEventExport = z.infer<typeof psychologyEventExportSchema>;

// --- Check-ups: short standard questionnaires, for watching oneself over time ---

/**
 * A questionnaire: every item is answered on the same scale `0…maxAnswer`, the answers are
 * added up and the sum is read against `bands` (the lowest sum of each band, ascending).
 * The texts of the items are the client's translations (`psychology.tests.<id>.items.<n>`).
 *
 * They are instruments of self-observation used in research and primary care — never a
 * diagnosis; the page says so. WHO-5 is free to use (WHO); PHQ-9 and GAD-7 may be reproduced
 * without permission.
 */
export interface Questionnaire {
  id: 'who5' | 'gad7' | 'phq9';
  items: number;
  maxAnswer: number;
  /** The sum is shown multiplied by this (WHO-5: ×4, a percentage). */
  scale: number;
  /** `true` — a higher sum is better (well-being); `false` — worse (anxiety, low mood). */
  higherIsBetter: boolean;
  bands: { from: number; key: string }[];
  /** An item an answer above zero to which is told apart: thoughts of self-harm. */
  careItem?: number;
}

export const QUESTIONNAIRES: Questionnaire[] = [
  {
    id: 'who5',
    items: 5,
    maxAnswer: 5,
    scale: 4,
    higherIsBetter: true,
    bands: [
      { from: 0, key: 'low' },
      { from: 13, key: 'fine' },
    ],
  },
  {
    id: 'gad7',
    items: 7,
    maxAnswer: 3,
    scale: 1,
    higherIsBetter: false,
    bands: [
      { from: 0, key: 'minimal' },
      { from: 5, key: 'mild' },
      { from: 10, key: 'moderate' },
      { from: 15, key: 'severe' },
    ],
  },
  {
    id: 'phq9',
    items: 9,
    maxAnswer: 3,
    scale: 1,
    higherIsBetter: false,
    bands: [
      { from: 0, key: 'minimal' },
      { from: 5, key: 'mild' },
      { from: 10, key: 'moderate' },
      { from: 15, key: 'moderatelySevere' },
      { from: 20, key: 'severe' },
    ],
    careItem: 9,
  },
];

export type QuestionnaireId = Questionnaire['id'];

/** The band a sum falls into. */
export function questionnaireBand(questionnaire: Questionnaire, sum: number): string {
  return [...questionnaire.bands].reverse().find((band) => sum >= band.from)?.key ?? '';
}

export const psychologyAssessmentInputSchema = z
  .object({
    test: z.enum(['who5', 'gad7', 'phq9']),
    takenOn: day,
    answers: z.array(z.number().int().min(0).max(5)).min(1).max(20),
  })
  .superRefine((input, ctx) => {
    const questionnaire = QUESTIONNAIRES.find((item) => item.id === input.test);
    if (!questionnaire || input.answers.length !== questionnaire.items) {
      ctx.addIssue({ code: 'custom', path: ['answers'], message: 'Every item needs an answer' });
    } else if (input.answers.some((answer) => answer > questionnaire.maxAnswer)) {
      ctx.addIssue({ code: 'custom', path: ['answers'], message: 'An answer is off the scale' });
    }
  });
export type PsychologyAssessmentInput = z.infer<typeof psychologyAssessmentInputSchema>;

export interface PsychologyAssessment {
  id: string;
  test: QuestionnaireId;
  takenOn: LocalDate;
  answers: number[];
  /** The sum of the answers. */
  sum: number;
  /** The sum as it is shown (WHO-5: a percentage). */
  score: number;
  band: string;
  /** An answer above zero to the item about self-harm: the page says where to turn. */
  care: boolean;
}

// --- Reflection: a few questions about the week ---

export interface PsychologyReflection {
  id: string;
  /** The Monday of the week. */
  week: LocalDate;
  questions: string[];
  /** One answer a question; an empty string — not answered yet. */
  answers: string[];
  /** Written by the AI from the week's data, or the standard ones. */
  byAi: boolean;
  createdAt: string;
}

export const psychologyReflectionAnswersSchema = z.object({
  answers: z.array(z.string().trim().max(5000)).max(10),
});
export type PsychologyReflectionAnswers = z.infer<typeof psychologyReflectionAnswersSchema>;

/** `PUT /api/psychology/settings`: only what is sent is changed. */
export const psychologySettingsSchema = z.object({
  weeklyReview: z.boolean().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
});
export type PsychologySettingsInput = z.infer<typeof psychologySettingsSchema>;

export interface PsychologySettings {
  /** Three questions about the week every Sunday evening. */
  weeklyReview: boolean;
  /** Puts the events told by age among the dated ones; `null` — not given. */
  birthYear: number | null;
}

// --- Patterns: the mood over time ---

export const psychologyPatternsQuerySchema = z.object({ from: day, to: day });
export type PsychologyPatternsQuery = z.infer<typeof psychologyPatternsQuerySchema>;

export interface PsychologyPatterns {
  from: LocalDate;
  to: LocalDate;
  /** Days with a mood in the period. */
  days: number;
  average: number | null;
  /** Monday first; `null` — no mood on that day of the week. */
  byWeekday: { weekday: number; average: number | null; days: number }[];
  /** The average of every week (its Monday), oldest first. */
  weeks: { week: LocalDate; average: number; days: number }[];
  /** The longest run of days in a row with a low mood (1–2), and when it began. */
  longestLowRun: { days: number; from: LocalDate } | null;
  /** The events of the period with the average mood during each; `null` — no mood then. */
  events: { id: string; title: string; from: LocalDate; to: LocalDate; mood: number | null }[];
}
