import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** Unlocked achievements. A row is never deleted — an achievement stays forever. */
export const unlockedAchievements = pgTable(
  'achievements_unlocked',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `<metric>.<threshold>`, for example `diary.longest-streak.30`. */
    achievementId: text().notNull(),
    unlockedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
);
