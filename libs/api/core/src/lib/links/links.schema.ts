import {ForecastDriver, InsightFact, QuestionWhen} from '@pd/contracts';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {users} from '../users/users.schema';

/**
 * The days a number's level changed (see changePoints), over the whole history: found by a
 * nightly server job and kept, as two years of every number are too many to search on every
 * request. A sync client gets them with the sync and searches none itself.
 */
export const linksChangePoints = pgTable(
  'links_change_points',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** The number's key, e.g. `activity.phone.night`, and how to show it (see DailyMetric). */
    key: text().notNull(),
    module: text().notNull(),
    labelKey: text().notNull(),
    label: text(),
    unit: text().notNull(),
    currency: text(),
    extra: boolean().notNull().default(false),
    outcome: boolean().notNull().default(false),
    /** The first day of the new level. */
    day: date({mode: 'string'}).notNull(),
    before: real().notNull(),
    after: real().notNull(),
    /** The difference of the levels in the days' spread: how large. */
    effect: real().notNull(),
  },
  table => [unique().on(table.userId, table.key, table.day)],
);

/**
 * What of Links the user has opened (a change point, a dose–response chart): for the
 * achievements of exploring, never for the numbers themselves.
 */
export const linksSeen = pgTable(
  'links_seen',
  {
    // No id of its own: the same thing opened on the server and on a sync client is one row,
    // merged by the sync instead of clashing on a unique key (as dashboard_active_days).
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /**
     * `change` — a change point; `dose` — the chart of a pair; `even` — a day with nothing
     * unusual, kept by the nightly job.
     */
    kind: text().notNull(),
    /** The change's id, the pair's `a|b`, or the even day. */
    key: text().notNull(),
    seenAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [primaryKey({columns: [table.userId, table.kind, table.key]})],
);

/**
 * The forecasts made (see forecast.ts): the morning's of the day and the evening's of the next,
 * kept to say later how close they came — and, one day, to teach a model of the user's own. Made
 * by the server's job; a sync client gets them with the sync and makes none itself.
 */
export const linksForecasts = pgTable(
  'links_forecasts',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** The number forecast, e.g. `tasks.done` or `links.bedtime`, and how to show it. */
    key: text().notNull(),
    module: text().notNull(),
    labelKey: text().notNull(),
    label: text(),
    unit: text().notNull(),
    currency: text(),
    /** The day forecast. */
    day: date({mode: 'string'}).notNull(),
    /** `morning` — that day's morning, from the day before; `evening` — the evening before. */
    made: text().notNull(),
    value: real().notNull(),
    /** The model's and the plain guess's mean miss on the latest days, when it was made. */
    error: real().notNull(),
    baselineError: real().notNull(),
    /** Which plain guess it was measured against: `yesterday`, `week` or `weekday`. */
    baseline: text().notNull(),
    /** The days it learned from. */
    days: integer().notNull(),
    trusted: boolean().notNull(),
    drivers: jsonb().$type<ForecastDriver[]>().notNull(),
    madeAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [unique().on(table.userId, table.key, table.day, table.made)],
);

/** The user's choices of Links kept on the server: the jobs read them, not only the page. */
export const linksSettings = pgTable('links_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  /** The forecast's targets chosen beyond the default ones (DEFAULT_FORECAST_TARGETS). */
  forecastTargets: text().array().notNull().default([]),
});

/** The owner's own questions of Links ("does A go with B?"): the engine answers them anew each time. */
export const linksQuestions = pgTable(
  'links_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** The owner's own words, when the question was asked in them. */
    title: text(),
    cause: text().notNull(),
    effect: text().notNull(),
    when: text().$type<QuestionWhen>().notNull(),
    /** "Only when this number is high (or low)": its key and which. */
    conditionKey: text(),
    conditionHigh: boolean(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/**
 * The week's findings (Links v2's insight cards): made by a weekly job from what the engine
 * found, worded by the AI, kept so the week reads the same and Home shows one a day.
 */
export const linksInsights = pgTable(
  'links_insights',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    /** The Monday of the week. */
    week: date({mode: 'string'}).notNull(),
    /**
     * What the finding is about, the same each time it is found again (`pair|a|b|nextDay`): its
     * proof opened counts once, however often the week is looked at again.
     */
    key: text().notNull(),
    /** The order of the week's cards, the strongest first. */
    position: integer().notNull(),
    fact: jsonb().$type<InsightFact>().notNull(),
    /** The AI's sentence; `null` — no AI, the page words the fact itself. */
    text: text(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.week)],
);
