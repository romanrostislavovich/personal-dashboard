/** Mood 1–5 as emoji; labels are in the translations (`diary.moods.<n>`). */
export const MOOD_EMOJI: Record<number, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
};

/**
 * Diverging scale for the heatmap and charts: red (bad) → neutral grey (okay) → green (great).
 * Every use also shows the emoji or a label, so the color is never the only signal.
 */
export const MOOD_COLOR: Record<number, string> = {
  1: 'light-dark(#d64545, #ff6b6b)',
  2: 'light-dark(#e08a3c, #ffa25c)',
  3: 'light-dark(#98a2b3, #8a94a6)',
  4: 'light-dark(#4caf6a, #74d68e)',
  5: 'light-dark(#1b8a4b, #2fc46a)',
};

/** Color for an average mood (e.g. 3.6 → the color of 4). */
export function moodColor(mood: number): string {
  return MOOD_COLOR[Math.min(5, Math.max(1, Math.round(mood)))];
}
