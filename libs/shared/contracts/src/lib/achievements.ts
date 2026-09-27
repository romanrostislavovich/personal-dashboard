export interface Achievement {
  /** `<metric>.<threshold>`, for example `diary.longest-streak.30`. */
  id: string;
  /** Source module (for grouping and the section title). */
  module: string;
  icon: string;
  title: string;
  description: string;
  goal: number;
  /** Current metric value, no more than `goal`. */
  progress: number;
  /** `null` — not unlocked yet. */
  unlockedAt: string | null;
}
