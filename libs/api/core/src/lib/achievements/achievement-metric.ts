/** Текст на нескольких языках: `{ ru: 'Неделя подряд' }`. Язык выбирается по `user.locale`. */
export type LocalizedText = Record<string, string>;

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
 * Короткая запись уровня. Строка = русский текст; для нескольких языков передай объект.
 * `achievementTier(7, '🔥', 'Неделя подряд', '7 дней подряд с записью')`
 */
export function achievementTier(
  goal: number,
  icon: string,
  title: LocalizedText | string,
  description: LocalizedText | string,
): AchievementTier {
  const text = (value: LocalizedText | string) =>
    typeof value === 'string' ? { ru: value } : value;
  return { goal, icon, title: text(title), description: text(description) };
}

export function localize(text: LocalizedText, locale: string): string {
  return text[locale] ?? text['ru'] ?? Object.values(text)[0] ?? '';
}
