import { users } from '@pd/api-core/schema';
import { WritingLanguage } from '@pd/contracts';
import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';

/** How the writing of a user is checked (see WritingSettings in contracts). */
export const writingSettings = pgTable('writing_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean().notNull().default(true),
  language: text().$type<WritingLanguage>().notNull().default('auto'),
  englishVariant: text().$type<'en-US' | 'en-GB'>().notNull().default('en-US'),
  picky: boolean().notNull().default(false),
  dictionary: text().array().notNull().default([]),
  disabledRules: text().array().notNull().default([]),
  ignoredSites: text().array().notNull().default([]),
  ignoredApps: text().array().notNull().default([]),
});
