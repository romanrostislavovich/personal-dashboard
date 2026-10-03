import { z } from 'zod';
import { LocalDate } from './local-date';

// The parts of the Activity section that look after the user rather than count time:
// focus sessions (Pomodoro), daily limits and the health of the computers.

const moment = z.iso.datetime({ offset: true });

// --- Focus sessions ---

/** A focus session as the desktop app reports it when its work part ends (or is stopped). */
export const activityFocusSessionSchema = z.object({
  /** Made by the app: a session sent twice is saved once. */
  id: z.uuid(),
  startedAt: moment,
  endedAt: moment,
  plannedMinutes: z.number().int().min(1).max(240),
  /** Time the session actually ran. */
  focusSeconds: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600),
  /** Ran to the end rather than stopped early. */
  completed: z.boolean(),
  projectId: z.uuid().nullable(),
  /** What the session was for, in the user's words. */
  note: z.string().trim().max(200).nullable(),
  /** Time in distracting programs during the session — recorded, never interrupted. */
  distractions: z
    .array(
      z.object({
        app: z.string().min(1).max(120),
        name: z.string().max(200),
        seconds: z
          .number()
          .int()
          .min(0)
          .max(24 * 3600),
      }),
    )
    .max(20),
});
export type ActivityFocusSessionInput = z.infer<typeof activityFocusSessionSchema>;

export interface ActivityFocusSession extends ActivityFocusSessionInput {
  /** The project's name, when the session belongs to one. */
  projectName: string | null;
  deviceId: string;
}

export interface ActivityFocusStats {
  /** Newest first. */
  sessions: ActivityFocusSession[];
  focusSeconds: number;
  completed: number;
  distractedSeconds: number;
  /** Every day of the period. */
  days: { day: LocalDate; seconds: number }[];
  projects: { projectId: string | null; name: string | null; seconds: number }[];
  /** Days in a row with a completed session, up to today, and the most ever. */
  streak: { current: number; longest: number };
}

/** The timer of the focus sessions, set in the dashboard and followed by every desktop app. */
export const activityFocusSettingsSchema = z.object({
  focusMinutes: z.number().int().min(5).max(120),
  shortBreakMinutes: z.number().int().min(1).max(30),
  longBreakMinutes: z.number().int().min(5).max(60),
  /** Work parts before a long break. */
  roundsBeforeLongBreak: z.number().int().min(2).max(8),
});
export type ActivityFocusSettings = z.infer<typeof activityFocusSettingsSchema>;

// --- Daily limits ---

/** `games` — time in games; `total` — at the computer at all; `app` — one program. */
export const ACTIVITY_LIMIT_KINDS = ['games', 'total', 'app'] as const;
export type ActivityLimitKind = (typeof ACTIVITY_LIMIT_KINDS)[number];

export const activityLimitSchema = z
  .object({
    kind: z.enum(ACTIVITY_LIMIT_KINDS),
    /** The program of an `app` limit (its process name); `null` for the others. */
    app: z.string().trim().toLowerCase().min(1).max(120).nullable(),
    minutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60),
  })
  .refine(
    (limit) => (limit.kind === 'app') === !!limit.app,
    'Only a program limit names a program',
  );
export type ActivityLimitInput = z.infer<typeof activityLimitSchema>;

/** `PUT /api/activity/limits`: the whole set at once. */
export const activityLimitsSchema = z.object({ limits: z.array(activityLimitSchema).max(50) });
export type ActivityLimits = z.infer<typeof activityLimitsSchema>;

export interface ActivityLimit extends ActivityLimitInput {
  id: string;
}

// --- Health of the computers ---

/** What a desktop app reports about its computer every few minutes. */
export const activityHealthSchema = z.object({
  at: moment,
  /** Processor load over the last minutes, percent. */
  cpu: z.number().min(0).max(100),
  memoryUsed: z.number().int().min(0),
  memoryTotal: z.number().int().min(1),
  /** Since the last restart. */
  uptimeSeconds: z.number().int().min(0),
  disks: z
    .array(
      z.object({
        /** `C:` */
        mount: z.string().trim().min(1).max(20),
        total: z.number().int().min(0),
        free: z.number().int().min(0),
      }),
    )
    .max(30),
});
export type ActivityHealthInput = z.infer<typeof activityHealthSchema>;

export interface ActivityComputer {
  deviceId: string;
  name: string;
  lastSeenAt: string | null;
  latest: ActivityHealthInput | null;
  /** The last day, oldest first. */
  history: { at: string; cpu: number; memory: number }[];
}

/** A disk with less free space than this share is reported. */
export const ACTIVITY_LOW_DISK_SHARE = 0.1;
