import {z} from 'zod';
import {DailyMetric} from './links';
import {LocalDate} from './local-date';

/*
 * Questions and insights (Links v2, stage 4): the owner's hypotheses as cards the engine
 * answers with the data there is, and the week's findings worded by the AI
 * (docs/proposals/links-v2.md).
 */

/**
 * When the effect is looked for: the same day, the next day, or (for an event) the hour after
 * it against the same weekday hours without it.
 */
export const QUESTION_WHEN = ['sameDay', 'nextDay', 'hourAfter'] as const;
export type QuestionWhen = (typeof QUESTION_WHEN)[number];

/** What could explain a link away: it is checked whether the link holds within each. */
export const CONFOUNDERS = ['weekend', 'rain', 'illness', 'travel'] as const;
export type Confounder = (typeof CONFOUNDERS)[number];

/** A number or an event as the cards name it. */
export interface QuestionNumber {
  key: string;
  module: string;
  labelKey: string;
  label?: string;
  unit: DailyMetric['unit'] | 'minutes';
}

/** "Does A go with B?", and optionally "only when C is high (or low)". */
export const questionInputSchema = z.object({
  /** The owner's own words, when the question was asked in them. */
  title: z.string().trim().max(200).optional(),
  cause: z.string().min(1).max(120),
  effect: z.string().min(1).max(120),
  when: z.enum(QUESTION_WHEN),
  condition: z
    .object({key: z.string().min(1).max(120), high: z.boolean()})
    .optional(),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

/**
 * Why a question was not kept or not turned into a card, for the page to tell in its language
 * (`reason` of a 400 or 422; an AI's own reason comes as `message` instead).
 */
export const QUESTION_REJECTIONS = [
  'noCard',
  'noWhen',
  'unknownNumbers',
  'duplicate',
  'tooMany',
  'noAi',
] as const;
export type QuestionRejection = (typeof QUESTION_REJECTIONS)[number];

/** A question in the owner's words, for the AI to turn into a card to confirm. */
export const questionDraftSchema = z.object({
  text: z.string().trim().min(3).max(500),
});
export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export interface LinksQuestion {
  /** A built-in one's id is its name (`builtin.notifications`), an own one's a uuid. */
  id: string;
  builtIn: boolean;
  title: string | null;
  cause: string;
  effect: string;
  when: QuestionWhen;
  condition: {key: string; high: boolean} | null;
}

export interface QuestionAnswer {
  /** `answered`; `few` — not enough days (or times) yet; `missing` — a number is not there. */
  status: 'answered' | 'few' | 'missing';
  /** The days (or, for the hour after, the times) it was answered from. */
  n: number;
  /** The cause's middle: the days above it are "more", the rest "less" (not for an event). */
  threshold: number | null;
  /** The effect on the days of more of the cause and of less (after an event: after, usual). */
  high: number | null;
  low: number | null;
  difference: number | null;
  /** The chance alone gives a difference this large. */
  p: number | null;
  /** Large and sure enough to tell. */
  strong: boolean;
  /** Whether the difference holds within weekdays and weekends, dry and rainy days… */
  confounders: {confounder: Confounder; holds: boolean | null}[];
  /** With a condition: the difference when it is high and when it is low. */
  condition: {whenHigh: number | null; whenLow: number | null} | null;
}

export interface LinksQuestionCard {
  question: LinksQuestion;
  cause: QuestionNumber | null;
  effect: QuestionNumber | null;
  condition: QuestionNumber | null;
  answer: QuestionAnswer;
}

/** `GET /api/life/questions`: the cards, and what a new one can be made of. */
export interface LinksQuestions {
  cards: LinksQuestionCard[];
  /** The daily numbers (a cause or an effect of the same or the next day). */
  numbers: QuestionNumber[];
  /** The events (a cause of the hour after) and the hourly numbers (its effect). */
  events: QuestionNumber[];
  hourly: QuestionNumber[];
}

/** One finding of the week, as the engine found it (the AI words it, the page shows its proof). */
export type InsightFact =
  | {
      kind: 'pair';
      cause: QuestionNumber;
      effect: QuestionNumber;
      when: 'sameDay' | 'nextDay';
      answer: QuestionAnswer;
    }
  | {
      kind: 'after';
      cause: QuestionNumber;
      effect: QuestionNumber;
      after: number;
      usual: number;
      difference: number;
      events: number;
    }
  | {
      kind: 'change';
      number: QuestionNumber;
      day: LocalDate;
      before: number;
      after: number;
    }
  | {
      kind: 'question';
      title: string | null;
      cause: QuestionNumber;
      effect: QuestionNumber;
      when: QuestionWhen;
      answer: QuestionAnswer;
    };

export interface LinksInsight {
  id: string;
  /** What it is about, the same each time it is found again (for "its proof opened"). */
  key: string;
  /** The Monday of the week it was found in. */
  week: LocalDate;
  fact: InsightFact;
  /** The AI's sentence in the user's language; `null` — no AI: the page words it itself. */
  text: string | null;
}

/** `GET /api/life/insights`: the latest week's findings, and which one is today's (Home). */
export interface LinksInsights {
  week: LocalDate | null;
  insights: LinksInsight[];
  /** The index of today's insight, a different one each day. */
  today: number;
}
