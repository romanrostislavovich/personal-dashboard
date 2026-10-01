import { z } from 'zod';

export const ACHIEVEMENT_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type AchievementRarity = (typeof ACHIEVEMENT_RARITIES)[number];

/** Experience for an unlocked achievement: the rarer, the more. */
export const RARITY_XP: Record<AchievementRarity, number> = {
  common: 10,
  rare: 25,
  epic: 50,
  legendary: 100,
};

export interface Achievement {
  /** `<metric>.<threshold>`, for example `diary.longest-streak.30`. */
  id: string;
  /** Source module (for grouping and the section title). */
  module: string;
  icon: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  xp: number;
  goal: number;
  /** Current metric value, no more than `goal`. */
  progress: number;
  /** `null` — not unlocked yet. */
  unlockedAt: string | null;
}

export interface LevelProgress {
  level: number;
  /** Experience earned within the current level. */
  xpInLevel: number;
  /** Experience needed to go from the current level to the next one. */
  xpForNext: number;
}

/**
 * Level from total experience. Going from level L to L+1 takes `100 × L` XP,
 * so early levels come quickly and later ones take real effort.
 */
export function levelFromXp(xp: number): LevelProgress {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (rest >= 100 * level) {
    rest -= 100 * level;
    level++;
  }
  return { level, xpInLevel: rest, xpForNext: 100 * level };
}

/** `POST /api/achievements/recount`: the section (module id) to count again. */
export const achievementsRecountSchema = z.object({
  module: z.string().trim().min(1).max(50),
});
export type AchievementsRecount = z.infer<typeof achievementsRecountSchema>;
