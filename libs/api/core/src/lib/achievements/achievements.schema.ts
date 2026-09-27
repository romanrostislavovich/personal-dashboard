import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema';

/** Открытые ачивки. Запись никогда не удаляется — ачивка остаётся навсегда. */
export const unlockedAchievements = pgTable(
  'achievements_unlocked',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `<метрика>.<порог>`, например `diary.longest-streak.30`. */
    achievementId: text().notNull(),
    unlockedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
);
