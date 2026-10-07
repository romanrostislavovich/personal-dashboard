import { projects, users } from '@pd/api-core/schema';
import {
  ActivityCategory,
  ActivityFocusSessionInput,
  ActivityHealthInput,
  ActivityLimitKind,
  ActivityPlatform,
  ActivitySystem,
  LocalDate,
} from '@pd/contracts';

/** The warnings a computer can send (see WellbeingService.saveHealth). */
export type ComputerAlert =
  | 'disk'
  | 'diskHealth'
  | 'heat'
  | 'reboot'
  /** Kept at a full charge on mains power most of the week. */
  | 'batteryFull'
  /** The battery's health fell under 80, 70, 60%: each said once. */
  | 'battery80'
  | 'battery70'
  | 'battery60';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/** A tracker the user installed: the desktop shell on a computer, later an app on a phone. */
export const activityDevices = pgTable('activity_devices', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  platform: text().$type<ActivityPlatform>().notNull(),
  /** SHA-256 of the token the device reports with; the token itself is shown once. */
  tokenHash: text().notNull().unique(),
  lastSeenAt: timestamp({ withTimezone: true }),
  /**
   * The day each warning about the computer was last sent (a disk running out of space or
   * failing, overheating, no restart for long): once a day is enough.
   */
  alertedOn: jsonb().$type<Partial<Record<ComputerAlert, LocalDate>>>().notNull().default({}),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * A stretch of time one window was in front. A tracker cuts a long stretch into pieces of a
 * few minutes, so a row never spans more than that — a day's total is a plain sum.
 */
export const activitySpans = pgTable(
  'activity_spans',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    /** The name of the process, lower case: what a program is recognized by. */
    app: text().notNull(),
    /** The name people know it by; the process name when the system gave none. */
    appName: text().notNull(),
    title: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
    seconds: integer().notNull(),
  },
  (table) => [
    // A batch sent twice (the answer was lost) does not double the time.
    unique().on(table.deviceId, table.startedAt),
    index().on(table.userId, table.startedAt),
  ],
);

/** What the user decided about a program: its category, or not to record it at all. */
export const activityApps = pgTable(
  'activity_apps',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    app: text().notNull(),
    /** `null` — the default one (see `defaultActivityCategory`). */
    category: text().$type<ActivityCategory>(),
    excluded: boolean().notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.userId, table.app] })],
);

/** Time whose window title contains the pattern belongs to the project. */
export const activityProjectRules = pgTable(
  'activity_project_rules',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    pattern: text().notNull(),
  },
  (table) => [unique().on(table.userId, table.projectId, table.pattern)],
);

export const activitySettings = pgTable('activity_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** No input for this long means the user is away. */
  idleMinutes: integer().notNull().default(5),
  /** Remind to take a break after this long without one; `0` — never. */
  breakMinutes: integer().notNull().default(60),
  focusMinutes: integer().notNull().default(25),
  shortBreakMinutes: integer().notNull().default(5),
  longBreakMinutes: integer().notNull().default(15),
  roundsBeforeLongBreak: integer().notNull().default(4),
  /** Window titles with any of these words are recorded without the title. */
  privateWords: text().array().notNull().default([]),
  /** The summary of the day: when (`HH:mm`, the user's own clock; `null` — never)... */
  summaryTime: text().default('21:00'),
  /** ...and the last day it was handled (sent, or there was nothing to sum up). */
  summarySentOn: date({ mode: 'string' }),
  /** Computers of other services (WakaTime) whose time is not added (see other-computers.ts). */
  skippedComputers: text().array().notNull().default([]),
  /** Minutes a task done today adds to the limit of games (the tasks come through the core). */
  gamesMinutesPerTask: integer().notNull().default(0),
});

/** "No more than this much a day": in games, at the computer at all, in one program. */
export const activityLimits = pgTable('activity_limits', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text().$type<ActivityLimitKind>().notNull(),
  /** The program of an `app` limit. */
  app: text(),
  minutes: integer().notNull(),
  /** The day the limit was last reported as reached: once a day. */
  notifiedOn: date({ mode: 'string' }),
});

/** A focus session (Pomodoro) of a desktop app: its work part, and what distracted from it. */
export const activityFocusSessions = pgTable(
  'activity_focus_sessions',
  {
    /** Made by the app: a session sent twice is saved once. */
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    projectId: uuid().references(() => projects.id, { onDelete: 'set null' }),
    note: text(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
    plannedMinutes: integer().notNull(),
    focusSeconds: integer().notNull(),
    completed: boolean().notNull(),
    distractions: jsonb().$type<ActivityFocusSessionInput['distractions']>().notNull(),
  },
  (table) => [index().on(table.userId, table.startedAt)],
);

/** The state of a computer every few minutes: load, memory, disks. Kept for a month. */
export const activityHealth = pgTable(
  'activity_health',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    at: timestamp({ withTimezone: true }).notNull(),
    cpu: real().notNull(),
    memoryUsed: bigint({ mode: 'number' }).notNull(),
    memoryTotal: bigint({ mode: 'number' }).notNull(),
    uptimeSeconds: integer().notNull(),
    disks: jsonb().$type<ActivityHealthInput['disks']>().notNull(),
    /** Temperature, battery, network, the system… — what the computer told beyond the basics. */
    system: jsonb().$type<ActivitySystem>(),
  },
  (table) => [primaryKey({ columns: [table.deviceId, table.at] })],
);

export type ActivityDeviceRow = typeof activityDevices.$inferSelect;
export type ActivitySpanRow = typeof activitySpans.$inferSelect;

/** A time a computer could not reach the server (no internet, or the server down). */
export const activityOutages = pgTable(
  'activity_outages',
  {
    /** Made by the app: an outage sent twice is saved once. */
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, { onDelete: 'cascade' }),
    kind: text().$type<'internet' | 'server'>().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (table) => [index().on(table.deviceId, table.startedAt)],
);
