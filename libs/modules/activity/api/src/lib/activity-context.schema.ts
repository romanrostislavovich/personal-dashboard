import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { TelemetryMetrics } from '@pd/contracts';
import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { activityDevices } from './activity.schema';

export const telemetryDynamics = pgTable(
  'telemetry_dynamics',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: uuid().notNull(),
    deviceId: uuid().references(() => activityDevices.id, { onDelete: 'cascade' }),
    source: text().$type<'desktop' | 'browser'>().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
    metrics: jsonb().$type<TelemetryMetrics>().notNull(),
    page: encryptedText(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index().on(table.userId, table.startedAt, table.id),
    index().on(table.deviceId),
  ],
);

export const activityWorkstates = pgTable(
  'activity_workstates',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    id: uuid().notNull(),
    deviceId: uuid().references(() => activityDevices.id, { onDelete: 'cascade' }),
    capturedAt: timestamp({ withTimezone: true }).notNull(),
    capture: encryptedText().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index().on(table.userId, table.capturedAt, table.id),
    index().on(table.deviceId),
  ],
);

registerEncryptedTables(telemetryDynamics, activityWorkstates);
