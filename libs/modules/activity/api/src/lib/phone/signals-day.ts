import { LocalDate, PhoneSignalsDay } from '@pd/contracts';

/** A signal as read back: the moment in ms and what it told (decrypted). */
export interface Signal {
  kind: string;
  at: number;
  data: Record<string, unknown> | null;
}

/** A day the numbers are counted for: its local midnight and the next one, ms. */
export interface DayBounds {
  day: LocalDate;
  start: number;
  end: number;
}

/** The phone's numbers of a day it counts itself, summed over the user's phones. */
export interface DailyValues {
  steps?: number;
  mobileBytes?: number;
}

const HOUR = 3_600_000;
/** A day of the phone starts at 4 am: the use after midnight belongs to the evening before. */
const MORNING_H = 4;
/** The night a rest is looked for in: from 20:00 the evening before to noon. */
const NIGHT_FROM_H = -4;
const NIGHT_TO_H = 12;
/** A stretch a signal left open (no "off" came) counts this long at most. */
const OPEN_MAX = 12 * HOUR;
/** The light and the noise are sampled every quarter of an hour. */
const SAMPLE_HOURS = 0.25;
const DAYLIGHT_LUX = 1000;
/** An alarm for the morning rings before this hour (later is a nap or a reminder). */
const ALARM_BY_H = 14;

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Hours of the intervals inside `[from, to)`, overlaps counted once. */
function hoursWithin(intervals: [number, number][], from: number, to: number): number {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const interval of clipped) {
    if (current && interval[0] <= current[1]) {
      current[1] = Math.max(current[1], interval[1]);
    } else {
      if (current) {
        total += current[1] - current[0];
      }
      current = [...interval];
    }
  }
  if (current) {
    total += current[1] - current[0];
  }
  return total / HOUR;
}

/**
 * The stretches a state was on: from a signal that says "on" to the next of the same `key` that
 * says "off" (or the next "on", a lost "off"); one left open counts up to `now`, OPEN_MAX at most.
 */
function stretches(
  signals: Signal[],
  isOn: (signal: Signal) => boolean | null,
  keyOf: (signal: Signal) => string,
  now: number,
): [number, number][] {
  const open = new Map<string, number>();
  const result: [number, number][] = [];
  for (const signal of signals) {
    const on = isOn(signal);
    if (on === null) {
      continue;
    }
    const key = keyOf(signal);
    const since = open.get(key);
    if (since !== undefined) {
      result.push([since, signal.at]);
      open.delete(key);
    }
    if (on) {
      open.set(key, signal.at);
    }
  }
  for (const since of open.values()) {
    result.push([since, Math.min(now, since + OPEN_MAX)]);
  }
  return result;
}

/**
 * The phone's signals as the numbers of each day (Activity → Phone, Links). A number is `null`
 * when the phone told nothing of its kind that day; a count the phone collects (calls, photos)
 * is 0 on a day it told other things, once it has told that kind at all in the period.
 */
export function signalsDays(
  days: DayBounds[],
  signals: Signal[],
  daily: Map<LocalDate, DailyValues>,
  now = Date.now(),
): PhoneSignalsDay[] {
  const sorted = [...signals].sort((a, b) => a.at - b.at);
  const of = (kind: string) => sorted.filter((signal) => signal.kind === kind);
  const kindsSeen = new Set(sorted.map((signal) => signal.kind));
  const screen = sorted.filter((s) => s.kind === 'screenOn' || s.kind === 'screenOff');
  const bluetooth = of('bluetooth');
  // Bluetooth headphones by their name, the wired ones as one.
  const headphones = [
    ...stretches(
      bluetooth.filter((s) => s.data?.['kind'] === 'headphones'),
      (s) => s.data?.['connected'] === true,
      (s) => String(s.data?.['name'] ?? ''),
      now,
    ),
    ...stretches(
      of('headphones'),
      (s) => s.data?.['connected'] === true,
      () => 'wired',
      now,
    ),
  ];
  const headphonesKinds = kindsSeen.has('bluetooth') ? 'bluetooth' : 'headphones';
  const car = stretches(
    bluetooth.filter((s) => s.data?.['kind'] === 'car'),
    (s) => s.data?.['connected'] === true,
    (s) => String(s.data?.['name'] ?? ''),
    now,
  );
  const media = stretches(
    of('media'),
    (s) => s.data?.['playing'] === true,
    (s) => String(s.data?.['app'] ?? ''),
    now,
  );
  const dnd = stretches(
    of('dnd'),
    (s) => s.data?.['on'] === true,
    () => 'dnd',
    now,
  );
  // The screen off until it came on again: the rests.
  const rests: [number, number][] = [];
  screen.forEach((signal, i) => {
    const next = screen.slice(i + 1).find((s) => s.kind === 'screenOn');
    if (signal.kind === 'screenOff' && next) {
      rests.push([signal.at, next.at]);
    }
  });

  return days.map(({ day, start, end }) => {
    const within = (s: Signal) => s.at >= start && s.at < end;
    const told = sorted.some(within);
    const count = (kind: string, pick: (list: Signal[]) => number) => {
      const list = of(kind).filter(within);
      if (list.length) {
        return pick(list);
      }
      return told && kindsSeen.has(kind) ? 0 : null;
    };
    const hours = (intervals: [number, number][], kind: string) =>
      kindsSeen.has(kind) && told ? round(hoursWithin(intervals, start, end)) : null;

    const morning = start + MORNING_H * HOUR;
    const dayScreen = screen.filter((s) => s.at >= morning && s.at < end + MORNING_H * HOUR);
    const firstOn = dayScreen.find((s) => s.kind === 'screenOn');
    const lastOff = [...dayScreen].reverse().find((s) => s.kind === 'screenOff');
    const nightFrom = start + NIGHT_FROM_H * HOUR;
    const nightTo = start + NIGHT_TO_H * HOUR;
    const longestRest = rests
      .map(([a, b]) => Math.min(b, nightTo) - Math.max(a, nightFrom))
      .reduce((max, length) => Math.max(max, length), 0);

    const calls = of('call').filter(within);
    const noise = of('noise')
      .filter(within)
      .map((s) => Number(s.data?.['db']))
      .filter(Number.isFinite);
    const light = of('light')
      .filter(within)
      .map((s) => Number(s.data?.['lux']))
      .filter(Number.isFinite);
    const reactions = of('notificationReaction').filter(within);
    const opened = reactions.filter((s) => s.data?.['reaction'] === 'opened');
    const battery = of('battery')
      .filter(within)
      .map((s) => Number(s.data?.['temperature']))
      .filter((c) => Number.isFinite(c) && c !== 0);
    const values = daily.get(day);
    return {
      day,
      firstUse: firstOn ? clock((firstOn.at - start) / HOUR) : null,
      lastUse: lastOff ? clock((lastOff.at - start) / HOUR) : null,
      restHours: longestRest > 0 ? round(longestRest / HOUR) : null,
      steps: values?.steps ?? null,
      headphonesHours: hours(headphones, headphonesKinds),
      carHours: hours(car, 'bluetooth'),
      mediaHours: hours(media, 'media'),
      dndHours: hours(dnd, 'dnd'),
      calls: count('call', (list) => list.length),
      callMinutes: count('call', (list) =>
        round(list.reduce((sum, s) => sum + Number(s.data?.['seconds'] ?? 0), 0) / 60),
      ),
      people: count(
        'call',
        () => new Set(calls.map((s) => String(s.data?.['who'] ?? '')).filter(Boolean)).size,
      ),
      photos: count('photo', (list) => list.length),
      mobileMegabytes:
        values?.mobileBytes === undefined ? null : round(values.mobileBytes / 1_000_000),
      noiseDb: noise.length ? Math.round(noise.reduce((a, b) => a + b, 0) / noise.length) : null,
      daylightHours: light.length
        ? round(light.filter((lux) => lux >= DAYLIGHT_LUX).length * SAMPLE_HOURS)
        : null,
      alarm: alarmOf(of('alarm'), start),
      notificationsOpened: reactions.length
        ? Math.round((opened.length / reactions.length) * 100)
        : null,
      secondsToOpen: median(opened.map((s) => Number(s.data?.['seconds'])).filter(Number.isFinite)),
      batteryMaxC: battery.length ? Math.max(...battery) : null,
    };
  });
}

/**
 * The alarm the morning of the day starting at `start` rang (or would have): the next alarm the
 * phone told before it rang, when it falls between midnight and ALARM_BY_H. A signal is a change
 * of the next alarm: set, moved, switched off (no `at`) — or the next one once this one rang.
 */
function alarmOf(alarms: Signal[], start: number): string | null {
  const morning = start + ALARM_BY_H * HOUR;
  let found: number | null = null;
  for (const signal of alarms) {
    // Told after it rang: the next alarm, for another day; this one stays.
    if (signal.at >= morning || (found !== null && signal.at >= found)) {
      break;
    }
    const at = signal.data?.['at'];
    found = typeof at === 'number' && at >= start && at < morning ? at : null;
  }
  return found === null ? null : clock((found - start) / HOUR);
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

/** Hours since midnight as `HH:MM`; after midnight it goes on (25:30 — half past one). */
export function clock(hours: number): string {
  const minutes = Math.round(hours * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** `HH:MM` back to hours (for Links' clock numbers). */
export function hoursOf(clockText: string | null): number | null {
  if (!clockText) {
    return null;
  }
  const [h, m] = clockText.split(':').map(Number);
  return round(h + m / 60, 2);
}
