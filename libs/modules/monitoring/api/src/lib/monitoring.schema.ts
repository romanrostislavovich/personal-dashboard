import { projects, users } from '@pd/api-core/schema';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const monitorStatus = pgEnum('monitoring_status', ['up', 'down', 'pending']);

/** Проверяемые адреса. У проекта может быть несколько: сайт, API, админка. */
export const monitors = pgTable('monitoring_monitors', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Мониторинг — часть проекта: удалили проект — удалились и его мониторы.
  projectId: uuid()
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  url: text().notNull(),

  status: monitorStatus().notNull().default('pending'),
  /** Подряд неудачных проверок — «упал» объявляем только после нескольких. */
  consecutiveFailures: smallint().notNull().default(0),
  /** Время первой неудачной проверки в текущей серии. */
  failingSince: timestamp({ withTimezone: true }),
  lastCheckedAt: timestamp({ withTimezone: true }),
  lastStatusCode: smallint(),
  lastResponseMs: integer(),
  lastError: text(),
  sslExpiresAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** История проверок — для процента доступности и графика времени ответа. */
export const checkResults = pgTable(
  'monitoring_check_results',
  {
    id: uuid().primaryKey().defaultRandom(),
    monitorId: uuid()
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    isUp: boolean().notNull(),
    statusCode: smallint(),
    responseMs: integer(),
  },
  (table) => [index().on(table.monitorId, table.checkedAt)],
);

export type MonitorRow = typeof monitors.$inferSelect;
