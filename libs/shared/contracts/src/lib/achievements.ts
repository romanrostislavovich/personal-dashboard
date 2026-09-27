export interface Achievement {
  /** `<метрика>.<порог>`, например `diary.longest-streak.30`. */
  id: string;
  /** Модуль-источник (для группировки и названия раздела). */
  module: string;
  icon: string;
  title: string;
  description: string;
  goal: number;
  /** Текущее значение метрики, не больше `goal`. */
  progress: number;
  /** `null` — ещё не открыта. */
  unlockedAt: string | null;
}
