import { LocalizedText } from '../i18n/locale';

export type { LocalizedText };

export interface AchievementTier {
  /** Порог метрики, с которого ачивка открывается. */
  goal: number;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
}

/**
 * Метрика и её уровни. Модуль регистрирует метрики в `onModuleInit`:
 *
 * ```ts
 * achievements.register({
 *   id: 'diary.longest-streak',
 *   module: 'diary',
 *   measure: (userId) => this.diary.longestStreak(userId),
 *   tiers: [
 *     { goal: 7, icon: '🔥', title: { ru: 'Неделя подряд' }, description: { ru: '7 дней подряд с записью' } },
 *   ],
 * });
 * ```
 *
 * Открытая ачивка не пропадает, даже если значение метрики потом уменьшится
 * (например, звёзды на репозитории), поэтому метрика может быть и текущей величиной.
 */
export interface AchievementMetric {
  /** Уникальный id с префиксом модуля. */
  id: string;
  /** id web-модуля — по нему группируются ачивки на странице. */
  module: string;
  measure: (userId: string) => Promise<number>;
  tiers: AchievementTier[];
}

/**
 * Короткая запись уровня: `achievementTier(7, '🔥', { en: 'Week in a row', ru: 'Неделя подряд' }, {...})`
 */
export function achievementTier(
  goal: number,
  icon: string,
  title: LocalizedText,
  description: LocalizedText,
): AchievementTier {
  return { goal, icon, title, description };
}
