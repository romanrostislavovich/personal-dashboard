import {z} from 'zod';
import {DailyMetric} from './links';
import {LocalDate} from './local-date';

/*
 * The personal lab (Links v2, the last stage; docs/proposals/personal-lab.md): a small everyday
 * change tried on random days chosen before the start, and a calm description of what came of
 * it. No medications, no food, no sleep deprivation; nothing it says is a proof or medical.
 */

export const EXPERIMENT_CONDITIONS = ['ordinary', 'changed'] as const;
export type ExperimentCondition = (typeof EXPERIMENT_CONDITIONS)[number];

export const EXPERIMENT_STATUSES = [
  'running',
  'paused',
  'stopped',
  'done',
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/** How long one may run, in days. */
export const EXPERIMENT_DAYS = {min: 14, max: 60, usual: 28} as const;

/** Fewer days of either kind than this, and the lab says nothing of the result yet. */
export const EXPERIMENT_MIN_EACH = 6;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** The main number: a daily number of Links, or a rating 1–5 the bot asks for with buttons. */
export const experimentMetricSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('number'), key: z.string().min(1).max(120)}),
  z.object({
    kind: z.literal('rating'),
    question: z.string().trim().min(3).max(200),
    askAt: time,
  }),
]);
export type ExperimentMetricInput = z.infer<typeof experimentMetricSchema>;

export const experimentInputSchema = z.object({
  hypothesis: z.string().trim().min(3).max(300),
  /** What is done on a changed day ("the first work block without notifications"). */
  change: z.string().trim().min(3).max(200),
  metric: experimentMetricSchema,
  days: z.number().int().min(EXPERIMENT_DAYS.min).max(EXPERIMENT_DAYS.max),
  /** Today or later, in the user's time zone: the days are drawn before they come. */
  startOn: z.iso.date(),
  /** When the morning message tells what kind of day it is. */
  morningAt: time,
  /** The user says it is an everyday change: no medications, food or sleep deprivation. */
  safe: z.literal(true),
});
export type ExperimentInput = z.infer<typeof experimentInputSchema>;

/** A change of the rules after the start: the words and the hours only (a new version). */
export const experimentUpdateSchema = z.object({
  hypothesis: z.string().trim().min(3).max(300).optional(),
  change: z.string().trim().min(3).max(200).optional(),
  morningAt: time.optional(),
  askAt: time.optional(),
  status: z.enum(['running', 'paused', 'stopped']).optional(),
});
export type ExperimentUpdate = z.infer<typeof experimentUpdateSchema>;

/** A day marked by hand: the rating, and whether the change (or the ordinary day) was kept. */
export const experimentDaySchema = z.object({
  day: z.iso.date(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  kept: z.boolean().nullable().optional(),
});
export type ExperimentDayInput = z.infer<typeof experimentDaySchema>;

export interface ExperimentResult {
  ordinary: {n: number; mean: number | null; spread: number | null};
  changed: {n: number; mean: number | null; spread: number | null};
  /** Changed minus ordinary; `null` — a kind of day has no value yet. */
  difference: number | null;
  /** The middle 95 % of the difference when the days are resampled; `null` — not enough yet. */
  interval: [number, number] | null;
  /** Enough days of both kinds to say anything. */
  enough: boolean;
  /** Days the plan was not kept (left out), and days with no value (missing, never zeros). */
  notKept: number;
  missing: number;
}

export interface Experiment {
  id: string;
  hypothesis: string;
  change: string;
  metric:
    | {
        kind: 'number';
        key: string;
        labelKey: string;
        label?: string;
        unit: DailyMetric['unit'];
      }
    | {kind: 'rating'; question: string; askAt: string};
  startOn: LocalDate;
  endOn: LocalDate;
  morningAt: string;
  status: ExperimentStatus;
  /** The rules' version: a change of the words or the hours makes a new one. */
  version: number;
  versions: {
    version: number;
    at: string;
    hypothesis: string;
    change: string;
    morningAt: string;
    askAt: string | null;
  }[];
  /**
   * Every day of the plan, to come ones too: its kind, the value (`null` — missing or not yet;
   * a number of Links is known once the day is over, a rating once given) and whether the plan
   * was kept.
   */
  days: {
    day: LocalDate;
    condition: ExperimentCondition;
    value: number | null;
    kept: boolean | null;
  }[];
  /** Today's kind, while it runs. */
  today: ExperimentCondition | null;
  result: ExperimentResult;
}

/** `GET /api/life/experiments`: the newest first. */
export interface LinksLab {
  today: LocalDate;
  experiments: Experiment[];
}
