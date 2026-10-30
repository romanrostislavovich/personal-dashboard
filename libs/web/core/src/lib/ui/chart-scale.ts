/**
 * The top of a chart's scale: 1 / 2 / 2.5 / 5 × 10ⁿ just above the largest value
 * (1830 → 2000, 420 → 500), so the top gridline has a round, readable label.
 */
export function niceCeil(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find(s => s * power >= value) ?? 10;
  return step * power;
}

/** The gridlines of a chart, as shares of its scale: the bottom, the middle and the top. */
export const CHART_TICKS = [0, 0.5, 1] as const;
