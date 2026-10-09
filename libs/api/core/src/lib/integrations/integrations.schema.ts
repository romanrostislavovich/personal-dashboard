import { IntegrationState } from '@pd/contracts';
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/**
 * The trouble of a connection the user was told about: a trouble is told once, and again only
 * when it changes (an error becomes an expired token) or comes back after being fixed.
 */
export const integrationAlerts = pgTable(
  'integration_alerts',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `development.github` (see IntegrationStatus.id). */
    integrationId: text().notNull(),
    state: text().$type<IntegrationState>().notNull(),
    toldAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.integrationId] })],
);
