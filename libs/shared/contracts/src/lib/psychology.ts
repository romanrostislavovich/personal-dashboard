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

// --- Events: something that happened over a period ---

/** How the event felt: from hard (-2) to good (2); `0` — neither. */
export const EVENT_FEELINGS = [-2, -1, 0, 1, 2] as const;
export type EventFeeling = (typeof EVENT_FEELINGS)[number];

export const psychologyEventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullish(),
    startedOn: day,
    /** The last day of it; `null` — one day, or still going on. */
    endedOn: day.nullish(),
    feeling: z
      .union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
      .default(0),
  })
  .refine((event) => !event.endedOn || event.endedOn >= event.startedOn, {
    message: 'The end is before the start',
    path: ['endedOn'],
  });
export type PsychologyEventInput = z.input<typeof psychologyEventInputSchema>;

export interface PsychologyEvent {
  id: string;
  title: string;
  description: string | null;
  startedOn: LocalDate;
  endedOn: LocalDate | null;
  feeling: EventFeeling;
  createdAt: string;
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

export const psychologySettingsSchema = z.object({
  /** Three questions about the week every Sunday evening. */
  weeklyReview: z.boolean(),
});
export type PsychologySettings = z.infer<typeof psychologySettingsSchema>;

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
