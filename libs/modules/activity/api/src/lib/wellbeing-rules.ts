import {
  ACTIVITY_LOW_DISK_SHARE,
  ACTIVITY_REBOOT_DAYS,
  ActivitySystem,
  ActivityCategory,
  ActivityFocusStats,
  ActivityHealthInput,
  ActivityLimitKind,
  computeStreaks,
  LocalDate,
  parseLocalDate,
} from '@pd/contracts';
import { daysOf } from './activity-stats';
import { ComputerAlert } from './activity.schema';

// The rules of focus sessions, daily limits and computer health — without a database.

export interface LimitRow {
  id: string;
  kind: ActivityLimitKind;
  app: string | null;
  minutes: number;
  notifiedOn: LocalDate | null;
}

export interface ReachedLimit {
  limit: LimitRow;
  usedSeconds: number;
}

/**
 * The limits reached today and not reported yet. `today` is time per program on the user's
 * today, on all devices together; a program's category decides what a game is.
 */
export function reachedLimits(
  limits: LimitRow[],
  today: ReadonlyMap<string, number>,
  categoryOf: (app: string) => ActivityCategory,
  day: LocalDate,
  /** Minutes earned on top of the limit of games (tasks done today). */
  gamesBonusMinutes = 0,
): ReachedLimit[] {
  const total = [...today.values()].reduce((sum, seconds) => sum + seconds, 0);
  const games = [...today].reduce(
    (sum, [app, seconds]) => (categoryOf(app) === 'games' ? sum + seconds : sum),
    0,
  );
  return limits.flatMap((limit) => {
    if (limit.notifiedOn === day) {
      return [];
    }
    const used =
      limit.kind === 'total'
        ? total
        : limit.kind === 'games'
          ? games
          : (today.get(limit.app ?? '') ?? 0);
    const minutes = limit.minutes + (limit.kind === 'games' ? gamesBonusMinutes : 0);
    return used >= minutes * 60 ? [{ limit: { ...limit, minutes }, usedSeconds: used }] : [];
  });
}

/** Disks with less than a tenth free. */
export function lowDisks(health: ActivityHealthInput): ActivityHealthInput['disks'] {
  return health.disks.filter(
    (disk) => disk.total > 0 && disk.free / disk.total < ACTIVITY_LOW_DISK_SHARE,
  );
}

export interface FocusRow {
  day: LocalDate;
  projectId: string | null;
  projectName: string | null;
  focusSeconds: number;
  completed: boolean;
  distractedSeconds: number;
}

/** The numbers of the focus tab: totals, days, projects; the streak needs every day ever. */
export function buildFocusStats(
  rows: FocusRow[],
  period: { from: LocalDate; to: LocalDate },
  completedDaysEver: LocalDate[],
  today: LocalDate,
): Omit<ActivityFocusStats, 'sessions'> {
  const byDay = new Map<LocalDate, number>();
  const byProject = new Map<string | null, { name: string | null; seconds: number }>();
  for (const row of rows) {
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.focusSeconds);
    const project = byProject.get(row.projectId) ?? { name: row.projectName, seconds: 0 };
    project.seconds += row.focusSeconds;
    byProject.set(row.projectId, project);
  }
  return {
    focusSeconds: rows.reduce((sum, row) => sum + row.focusSeconds, 0),
    completed: rows.filter((row) => row.completed).length,
    distractedSeconds: rows.reduce((sum, row) => sum + row.distractedSeconds, 0),
    days: daysOf(period.from, period.to).map((day) => ({ day, seconds: byDay.get(day) ?? 0 })),
    projects: [...byProject]
      .map(([projectId, { name, seconds }]) => ({ projectId, name, seconds }))
      .sort((a, b) => b.seconds - a.seconds),
    streak: computeStreaks(completedDaysEver, parseLocalDate(today)),
  };
}

/** Readings in a row the system must report throttling for: one hot moment is not overheating. */
const HEAT_READINGS = 3;
/** A reminder to restart repeats after this many days, not every day. */
const REBOOT_REPEAT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ComputerWarning =
  | { kind: 'disk'; disks: ActivityHealthInput['disks'] }
  | { kind: 'diskHealth'; disks: string[] }
  | { kind: 'heat' }
  | { kind: 'reboot'; days: number }
  | { kind: 'batteryFull' }
  | { kind: 'batteryHealth'; percent: number; below: 80 | 70 | 60 };

/** The readings of the last week: how often the battery sat full on mains power. */
export interface BatteryWeek {
  readings: number;
  full: number;
}

/** A week of readings every 5 minutes, at least a day's worth of them, mostly full and plugged in. */
const BATTERY_FULL_MIN_READINGS = 200;
const BATTERY_FULL_SHARE = 0.8;
const BATTERY_THRESHOLDS = [60, 70, 80] as const;

/** The key a warning is remembered by in `alertedOn`. */
export function alertKey(warning: ComputerWarning): ComputerAlert {
  return warning.kind === 'batteryHealth' ? `battery${warning.below}` : warning.kind;
}

/**
 * The warnings a reading of a computer gives, not sent yet today (`recent` — the readings
 * before it, newest first; `alertedOn` — when each warning was last sent).
 */
export function computerWarnings(
  health: ActivityHealthInput,
  recent: (ActivitySystem | null)[],
  alertedOn: Partial<Record<ComputerAlert, LocalDate>>,
  day: LocalDate,
  batteryWeek: BatteryWeek | null = null,
): ComputerWarning[] {
  const warnings: ComputerWarning[] = [];
  const low = lowDisks(health);
  if (low.length) {
    warnings.push({ kind: 'disk', disks: low });
  }
  const failing = (health.system?.physicalDisks ?? [])
    .filter((disk) => ['Warning', 'Unhealthy'].includes(disk.health))
    .map((disk) => disk.name);
  if (failing.length) {
    warnings.push({ kind: 'diskHealth', disks: failing });
  }
  const hot = (system: ActivitySystem | null | undefined) =>
    !!system?.thermal?.some((zone) => zone.throttling);
  const readings = [health.system, ...recent].slice(0, HEAT_READINGS);
  if (readings.length === HEAT_READINGS && readings.every(hot)) {
    warnings.push({ kind: 'heat' });
  }
  const bootedAt = health.system?.os?.bootedAt;
  const days = bootedAt ? Math.floor((Date.parse(health.at) - Date.parse(bootedAt)) / DAY_MS) : 0;
  if (days >= ACTIVITY_REBOOT_DAYS) {
    warnings.push({ kind: 'reboot', days });
  }
  if (
    batteryWeek &&
    batteryWeek.readings >= BATTERY_FULL_MIN_READINGS &&
    batteryWeek.full / batteryWeek.readings >= BATTERY_FULL_SHARE
  ) {
    warnings.push({ kind: 'batteryFull' });
  }
  const battery = health.system?.battery;
  if (battery?.designCapacity && battery.fullCapacity) {
    const percent = Math.round((battery.fullCapacity / battery.designCapacity) * 100);
    // The lowest threshold crossed: falling from 83% to 65% speaks once, of 70.
    const below = BATTERY_THRESHOLDS.find((threshold) => percent < threshold);
    if (below) {
      warnings.push({ kind: 'batteryHealth', percent, below });
    }
  }
  return warnings.filter((warning) => {
    const last = alertedOn[alertKey(warning)];
    if ((warning.kind === 'reboot' || warning.kind === 'batteryFull') && last) {
      return Date.parse(day) - Date.parse(last) >= REBOOT_REPEAT_DAYS * DAY_MS;
    }
    if (warning.kind === 'batteryHealth') {
      return !last; // Each threshold once, ever.
    }
    return last !== day;
  });
}
