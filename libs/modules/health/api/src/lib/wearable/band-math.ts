import type { SleepStage } from '@pd/contracts';

/**
 * What the dashboard counts from the band's minutes (docs/telemetry.md, "The band"). Plain
 * functions of numbers: the service reads the rows and saves what comes out.
 *
 * The stress index is the pulse at rest against the owner's own usual pulse at rest while awake
 * (not the night's resting pulse: sitting still by day is 15–25 % above it for anyone): a band
 * that is not a medical device gives no HRV by day (the Fitbit Air writes it at night only), so
 * the day's index is the pulse's, and the night adds HRV and the resting pulse against their
 * baselines.
 */

const MINUTE = 60_000;

export interface Minute {
  at: number;
  bpm: number | null;
  steps: number | null;
}

export interface Span {
  start: number;
  end: number;
}

export interface Stage extends Span {
  stage: SleepStage;
}

/** No steps in the minute and the five before it: the pulse is not a walk's. */
const STILL_FOR_MINUTES = 5;
/** An hour's index needs this many minutes at rest; fewer say too little. */
export const MIN_REST_MINUTES_PER_HOUR = 10;
/** A reaction: minutes at rest with a high index… */
const REACTION_SCORE = 85;
/** …at least this many of them, with gaps of at most this many minutes. */
const REACTION_MINUTES = 5;
const REACTION_GAP = 2;

const inside = (at: number, spans: Span[]) => spans.some((s) => at >= s.start && at < s.end);

/**
 * The minutes at rest: a pulse known, no steps for a while, not in an exercise and not asleep
 * (the night has its own numbers). `minutes` must be sorted by time.
 */
export function restMinutes(minutes: Minute[], exercises: Span[], sleeps: Span[]): Minute[] {
  const stepsAt = new Map(minutes.map((m) => [m.at, m.steps ?? 0]));
  return minutes.filter((m) => {
    if (m.bpm === null || inside(m.at, exercises) || inside(m.at, sleeps)) {
      return false;
    }
    for (let back = 0; back <= STILL_FOR_MINUTES; back++) {
      if ((stepsAt.get(m.at - back * MINUTE) ?? 0) > 0) {
        return false;
      }
    }
    return true;
  });
}

/**
 * The resting pulse of a day: the lowest half-hour of the night's sleep; without a night, the
 * 10th percentile of the day's minutes at rest (an hour of them at least).
 */
export function restingHeartRate(sleepMinutes: Minute[], rest: Minute[]): number | null {
  const night = lowestRollingMean(sleepMinutes, 30);
  if (night !== null) {
    return Math.round(night);
  }
  const values = rest.map((m) => m.bpm as number).sort((a, b) => a - b);
  return values.length >= 60 ? Math.round(values[Math.floor(values.length * 0.1)]) : null;
}

/** The lowest mean of `window` minutes in a row that the band told (gaps break the run). */
export function lowestRollingMean(minutes: Minute[], window: number): number | null {
  let lowest: number | null = null;
  let run: number[] = [];
  let last = -Infinity;
  for (const m of minutes) {
    if (m.bpm === null) {
      continue;
    }
    if (m.at - last > 2 * MINUTE) {
      run = [];
    }
    last = m.at;
    run.push(m.bpm);
    if (run.length > window) {
      run.shift();
    }
    if (run.length === window) {
      const mean = run.reduce((a, b) => a + b, 0) / window;
      lowest = lowest === null ? mean : Math.min(lowest, mean);
    }
  }
  return lowest;
}

/**
 * The index of a minute at rest, 0–100, from how far its pulse is above the owner's usual pulse
 * at rest while awake: at or below it is calm (under 25), up to +12 % normal (to 60), +25 % raised
 * (to 85), +45 % and more high (to 100). Personal through the baseline, the same scale for everyone.
 */
export function minuteStress(bpm: number, baseline: number): number {
  const rise = (bpm - baseline) / baseline;
  const steps: [number, number][] = [
    [-0.05, 0],
    [0, 25],
    [0.12, 60],
    [0.25, 85],
    [0.45, 100],
  ];
  if (rise <= steps[0][0]) {
    return 0;
  }
  for (let i = 1; i < steps.length; i++) {
    const [x1, y1] = steps[i];
    if (rise <= x1) {
      const [x0, y0] = steps[i - 1];
      return Math.round(y0 + ((rise - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return 100;
}

/** The index of each hour with enough minutes at rest: the mean of its minutes'. */
export function hourlyStress(
  rest: Minute[],
  baseline: number,
): { at: number; score: number; restMinutes: number }[] {
  const hours = new Map<number, number[]>();
  for (const m of rest) {
    const hour = Math.floor(m.at / (60 * MINUTE)) * 60 * MINUTE;
    hours.set(hour, [...(hours.get(hour) ?? []), minuteStress(m.bpm as number, baseline)]);
  }
  return [...hours]
    .filter(([, scores]) => scores.length >= MIN_REST_MINUTES_PER_HOUR)
    .map(([at, scores]) => ({
      at,
      score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      restMinutes: scores.length,
    }))
    .sort((a, b) => a.at - b.at);
}

/** The day's index: its hours', each as much as it had minutes at rest. */
export function dayStress(hours: { score: number; restMinutes: number }[]): number | null {
  const minutes = hours.reduce((sum, h) => sum + h.restMinutes, 0);
  return minutes
    ? Math.round(hours.reduce((sum, h) => sum + h.score * h.restMinutes, 0) / minutes)
    : null;
}

export interface Reaction {
  start: number;
  end: number;
  peakBpm: number;
  score: number;
}

/** The body's reactions: runs of minutes at rest with a high index (short gaps allowed). */
export function reactions(rest: Minute[], baseline: number): Reaction[] {
  const found: Reaction[] = [];
  let run: Minute[] = [];
  const close = () => {
    if (run.length >= REACTION_MINUTES) {
      const scores = run.map((m) => minuteStress(m.bpm as number, baseline));
      found.push({
        start: run[0].at,
        end: run[run.length - 1].at + MINUTE,
        peakBpm: Math.round(Math.max(...run.map((m) => m.bpm as number))),
        score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      });
    }
    run = [];
  };
  for (const m of rest) {
    if (minuteStress(m.bpm as number, baseline) < REACTION_SCORE) {
      continue;
    }
    const last = run[run.length - 1];
    if (last && m.at - last.at > (REACTION_GAP + 1) * MINUTE) {
      close();
    }
    run.push(m);
  }
  close();
  return found;
}

/** The minutes of each stage of a night (`out` — the band was off — counts nowhere). */
export function stageMinutes(stages: Stage[]): {
  asleep: number;
  deep: number;
  rem: number;
  light: number;
  awake: number;
} {
  const sum = { asleep: 0, deep: 0, rem: 0, light: 0, awake: 0 };
  for (const s of stages) {
    const minutes = Math.round((s.end - s.start) / MINUTE);
    if (s.stage === 'awake') {
      sum.awake += minutes;
    } else if (s.stage !== 'out') {
      sum.asleep += minutes;
      if (s.stage === 'deep' || s.stage === 'rem' || s.stage === 'light') {
        sum[s.stage] += minutes;
      }
    }
  }
  return sum;
}

/**
 * The night's score, 0–100, the way bands count it: its length (50 — 7½ hours asleep and more),
 * deep sleep and REM (25 — two fifths of the sleep and more), how restful (25 — little time awake
 * and the pulse falling at night against the day's resting pulse).
 */
export function sleepScore(
  night: { asleep: number; deep: number; rem: number; awake: number },
  nightPulse: number | null,
  restingBaseline: number | null,
): number | null {
  if (night.asleep < 60) {
    return null;
  }
  const length = 50 * Math.min(1, night.asleep / 450);
  const stages =
    night.deep + night.rem > 0
      ? 25 * Math.min(1, (night.deep + night.rem) / (night.asleep * 0.4))
      : 12.5;
  const calm = 1 - Math.min(1, night.awake / 60);
  const dip =
    nightPulse !== null && restingBaseline
      ? Math.max(0, Math.min(1, (restingBaseline - nightPulse) / restingBaseline / 0.1))
      : null;
  const restful = dip === null ? 25 * calm : 12.5 * calm + 12.5 * dip;
  return Math.round(length + stages + restful);
}

/** The middle of the values, for the 28-day baselines; `null` with fewer than `least`. */
export function median(values: number[], least = 3): number | null {
  if (values.length < least) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function spread(values: number[], center: number): number {
  const variance = values.reduce((sum, v) => sum + (v - center) ** 2, 0) / values.length;
  // Never less than a tenth of the baseline: a few calm weeks must not make a small change loud.
  return Math.max(Math.sqrt(variance), Math.abs(center) * 0.1);
}

/**
 * The night's stress, 0–100 (50 — as usual): HRV below its baseline and the resting pulse above
 * its own raise it. `null` before a baseline of a few nights.
 */
export function nightStress(
  hrv: number | null,
  resting: number | null,
  history: { hrv: number[]; resting: number[] },
): number | null {
  const parts: number[] = [];
  const hrvBase = median(history.hrv, 5);
  if (hrv !== null && hrvBase !== null) {
    parts.push((hrvBase - hrv) / spread(history.hrv, hrvBase));
  }
  const restingBase = median(history.resting, 5);
  if (resting !== null && restingBase !== null) {
    parts.push((resting - restingBase) / spread(history.resting, restingBase));
  }
  if (!parts.length) {
    return null;
  }
  const z = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.round(Math.max(0, Math.min(100, 50 + 20 * z)));
}

/** The day's index: the waking hours' and the night's together, whichever there is. */
export function combinedStress(day: number | null, night: number | null): number | null {
  if (day !== null && night !== null) {
    return Math.round(day * 0.6 + night * 0.4);
  }
  return day ?? night;
}

/**
 * Resilience, 0–100 (50 — the day's load as big as the night's recovery): the recovery is the
 * sleep's score and the night's calm, the load the day's stress at rest.
 */
export function resilience(
  sleep: number | null,
  night: number | null,
  load: number | null,
): number | null {
  const recoveryParts = [sleep, night === null ? null : 100 - night].filter(
    (v): v is number => v !== null,
  );
  if (!recoveryParts.length || load === null) {
    return null;
  }
  const recovery = recoveryParts.reduce((a, b) => a + b, 0) / recoveryParts.length;
  return Math.round(Math.max(0, Math.min(100, 50 + (recovery - load) / 2)));
}
