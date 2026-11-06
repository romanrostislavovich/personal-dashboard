import {ActivityCategory} from '@pd/contracts';

/*
 * Links v2's indices of a day (docs/proposals/links-v2.md, stage 1): numbers made of the day's
 * spans, unlocks and notifications — how restless the phone was, how deep the work went, what
 * the time was spent on. Pure: the moments come in, the numbers go out.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A stretch in front of one app or site, on the phone, the computer or in the browser. */
export interface IndexSpan {
  device: 'phone' | 'computer' | 'browser';
  /** The app's package or process, or the site. */
  app: string;
  category: ActivityCategory;
  start: number;
  end: number;
}

export interface DayMoments {
  /** The local midnight that starts the day, ms. */
  start: number;
  /** The next local midnight, ms. */
  end: number;
  /** Every span touching the day and the night after it (to 04:00), oldest first. */
  spans: IndexSpan[];
  unlocks: number[];
  notifications: number[];
  /** Focus sessions of the day: when they ran. */
  focus: {start: number; end: number}[];
  /** The owner's usual bedtime, hours of the day (23.5; over 24 — after midnight); `null` unknown. */
  bedtime: number | null;
}

/** The apps and sites that leave one worse off, to start with (the owner's list, 2026-11-06). */
const DRAINING = [
  'com.instagram.android',
  'com.zhiliaoapp.musically',
  'com.ss.android.ugc.trill',
  'com.vkontakte.android',
  'com.reddit.frontpage',
  'com.twitter.android',
  'com.facebook.katana',
  'instagram.com',
  'tiktok.com',
  'vk.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'facebook.com',
];

/** Work and learning: what feeds the day. */
const NOURISHING = new Set<ActivityCategory>([
  'development',
  'office',
  'design',
]);
/** Entertainment after bedtime: the draining apps, video and games. */
const ENTERTAINMENT = new Set<ActivityCategory>(['media', 'games']);

/** Deep work: this long in work apps without a switch away or a notification. */
export const DEEP_MINUTES = 25;
/** A window left this soon is a restless switch. */
const RESTLESS_MS = MINUTE;
/** A phone session this short (unlock → nothing → lock) is a check, not a use. */
const SHORT_SESSION_MS = 30_000;
/** Apart by more than this, two spans are not one stretch. */
const GAP_MS = MINUTE;
/** The late-night load starts at 23:00 and the night ends at 04:00. */
const LATE_HOUR = 23;
const NIGHT_END_HOUR = 28;
/** The morning: two hours from the first unlock. */
const MORNING_MS = 2 * HOUR;
/** Offline time is looked for between 08:00 and 22:00. */
const AWAKE_FROM = 8;
const AWAKE_TO = 22;

export function isDraining(app: string): boolean {
  const name = app.toLowerCase();
  return DRAINING.some(known => name === known || name.endsWith(`.${known}`));
}

/** The day's indices by key (`phone.restlessness`…); a missing one could not be counted. */
export function dayIndices(day: DayMoments): Map<string, number> {
  const result = new Map<string, number>();
  const set = (key: string, value: number | null, digits = 2) => {
    if (value !== null && Number.isFinite(value)) {
      const factor = 10 ** digits;
      result.set(key, Math.round(value * factor) / factor);
    }
  };
  const within = (span: IndexSpan, from: number, to: number) =>
    Math.max(0, Math.min(span.end, to) - Math.max(span.start, from));
  const ofDay = day.spans.filter(span => within(span, day.start, day.end) > 0);
  const phone = merge(ofDay.filter(span => span.device === 'phone'));
  const computer = merge(ofDay.filter(span => span.device === 'computer'));
  const screen = ofDay.filter(span => span.device !== 'browser');
  const hoursOf = (spans: IndexSpan[]) =>
    spans.reduce((sum, span) => sum + within(span, day.start, day.end), 0) /
    HOUR;
  const unlocks = day.unlocks.filter(at => at >= day.start && at < day.end);

  // The phone: unlocks and app switches per hour of use, and the share of mere checks.
  const phoneHours = hoursOf(phone);
  if (phoneHours > 0) {
    set('phone.restlessness', unlocks.length / phoneHours, 1);
    set('phone.appSwitches', switches(phone) / phoneHours, 1);
  }
  if (unlocks.length) {
    const short = unlocks.filter((at, index) => {
      const until = Math.min(unlocks[index + 1] ?? Infinity, at + 5 * MINUTE);
      const used = phone.reduce(
        (sum, span) => sum + within(span, at, until),
        0,
      );
      return used < SHORT_SESSION_MS;
    }).length;
    set('phone.shortSessions', (short / unlocks.length) * 100, 0);
  }

  // The computer: windows left within a minute, and the deep work.
  const computerHours = hoursOf(computer);
  if (computerHours > 0) {
    const restless = computer.filter(
      (span, index) =>
        span.end - span.start < RESTLESS_MS && index < computer.length - 1,
    ).length;
    set('computer.restlessness', restless / computerHours, 1);
    const blocks = deepBlocks(computer, day.notifications);
    const minutes = blocks.reduce((sum, block) => sum + block, 0);
    set('deepWork', minutes / 60);
    set('deepWorkLongest', Math.max(0, ...blocks), 0);
  }

  // What the time went on: what feeds the day and what drains it (any screen, the browser too).
  if (screen.length || ofDay.length) {
    const draining = ofDay.filter(span => isDraining(span.app));
    const nourishing = ofDay.filter(
      span => span.device === 'computer' && NOURISHING.has(span.category),
    );
    set('draining', hoursOf(draining));
    set('nourishing', hoursOf(nourishing));
  }

  // Notifications in focus sessions and in coding: per hour of them.
  const focused = [
    ...day.focus,
    ...computer
      .filter(span => span.category === 'development')
      .map(({start, end}) => ({start, end})),
  ];
  const focusHours =
    union(focused).reduce((sum, part) => sum + (part.end - part.start), 0) /
    HOUR;
  if (focusHours >= 0.25) {
    const inFocus = day.notifications.filter(at =>
      focused.some(part => at >= part.start && at < part.end),
    ).length;
    set('focusInterruptions', inFocus / focusHours, 1);
  }

  // The night: any screen from 23:00, and entertainment after the usual bedtime.
  const at = (hours: number) => day.start + hours * HOUR;
  const nightSpans = day.spans.filter(span => span.device !== 'browser');
  if (ofDay.length) {
    set(
      'lateNight',
      nightSpans.reduce(
        (sum, span) => sum + within(span, at(LATE_HOUR), at(NIGHT_END_HOUR)),
        0,
      ) / HOUR,
    );
    if (day.bedtime !== null && day.bedtime < NIGHT_END_HOUR) {
      set(
        'afterBedtime',
        day.spans
          .filter(
            span => isDraining(span.app) || ENTERTAINMENT.has(span.category),
          )
          .reduce(
            (sum, span) =>
              sum + within(span, at(day.bedtime as number), at(NIGHT_END_HOUR)),
            0,
          ) / MINUTE,
        0,
      );
    }
  }

  // The morning: from the first unlock after 04:00 to the first work, and the feeds before it.
  const firstUnlock = unlocks.find(moment => moment >= at(4));
  if (firstUnlock !== undefined) {
    const work = computer.find(
      span => span.end > firstUnlock && NOURISHING.has(span.category),
    );
    if (work) {
      set(
        'firstWork',
        (Math.max(work.start, firstUnlock) - firstUnlock) / MINUTE,
        0,
      );
    }
    set(
      'morningDraining',
      ofDay
        .filter(span => isDraining(span.app))
        .reduce(
          (sum, span) =>
            sum + within(span, firstUnlock, firstUnlock + MORNING_MS),
          0,
        ) / MINUTE,
      0,
    );
  }

  // The longest daytime stretch with no screen at all.
  if (ofDay.length || unlocks.length) {
    set(
      'offline',
      longestGap(screen, unlocks, at(AWAKE_FROM), at(AWAKE_TO)) / HOUR,
    );
  }
  return result;
}

/** The spans of one app that follow each other closely, as one. */
function merge(spans: IndexSpan[]): IndexSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: IndexSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.app === span.app && span.start - last.end <= GAP_MS) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({...span});
    }
  }
  return merged;
}

/** Changes from one app to another that follow closely (a switch, not a new session). */
function switches(spans: IndexSpan[]): number {
  let count = 0;
  for (let i = 1; i < spans.length; i++) {
    if (
      spans[i].app !== spans[i - 1].app &&
      spans[i].start - spans[i - 1].end <= GAP_MS
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Stretches of work (one run of work apps, switching among them allowed) without a notification,
 * of DEEP_MINUTES or more: their minutes.
 */
function deepBlocks(computer: IndexSpan[], notifications: number[]): number[] {
  const runs: {start: number; end: number}[] = [];
  for (const span of computer) {
    const last = runs[runs.length - 1];
    if (!NOURISHING.has(span.category)) {
      continue;
    }
    if (last && span.start - last.end <= GAP_MS) {
      last.end = Math.max(last.end, span.end);
    } else {
      runs.push({start: span.start, end: span.end});
    }
  }
  const blocks: number[] = [];
  for (const run of runs) {
    const cuts = notifications
      .filter(at => at > run.start && at < run.end)
      .sort((a, b) => a - b);
    let from = run.start;
    for (const to of [...cuts, run.end]) {
      const minutes = (to - from) / MINUTE;
      if (minutes >= DEEP_MINUTES) {
        blocks.push(Math.round(minutes));
      }
      from = to;
    }
  }
  return blocks;
}

function union(parts: {start: number; end: number}[]) {
  const sorted = [...parts].sort((a, b) => a.start - b.start);
  const result: {start: number; end: number}[] = [];
  for (const part of sorted) {
    const last = result[result.length - 1];
    if (last && part.start <= last.end) {
      last.end = Math.max(last.end, part.end);
    } else {
      result.push({...part});
    }
  }
  return result;
}

/** The longest stretch between `from` and `to` with no span and no unlock, ms. */
function longestGap(
  spans: IndexSpan[],
  unlocks: number[],
  from: number,
  to: number,
): number {
  const busy = union([
    ...spans.map(({start, end}) => ({start, end})),
    ...unlocks.map(moment => ({start: moment, end: moment + MINUTE})),
  ]).filter(part => part.end > from && part.start < to);
  let longest = 0;
  let cursor = from;
  for (const part of busy) {
    longest = Math.max(longest, part.start - cursor);
    cursor = Math.max(cursor, part.end);
  }
  return Math.max(longest, to - cursor);
}

/** The bedtime spread of a week: the standard deviation of the last uses (hours), ≥ 4 known. */
export function spreadOf(values: number[]): number | null {
  if (values.length < 4) {
    return null;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

/** The median of the known bedtimes: the owner's usual one. */
export function usualBedtime(values: number[]): number | null {
  if (values.length < 5) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
