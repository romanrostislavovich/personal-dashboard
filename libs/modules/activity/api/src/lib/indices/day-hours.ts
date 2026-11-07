import {
  DayMoments,
  deepRuns,
  IndexSpan,
  isDraining,
  merge,
  union,
  wallClock,
} from './day-indices';

/*
 * Links v2's hours of a day (docs/proposals/links-v2.md, stage 3): what the day's spans,
 * unlocks, notifications and focus sessions give hour by hour, and the events that happened at
 * an hour (a game began, a long phone session ended). Pure: the moments come in, the numbers of
 * each wall-clock hour go out.
 */

const MINUTE = 60_000;

/** The hourly numbers kept, by key (`activity.hour.<key>`): minutes of the hour or counts. */
export const HOURLY_MINUTES = [
  'computer',
  'phone',
  'deepWork',
  'focus',
  'draining',
  'meetings',
  'games',
] as const;
export const HOURLY_COUNTS = ['unlocks', 'notifications', 'switches'] as const;
/** The events kept, by key (`activity.event.<key>`), as 1 in the hour they happened. */
export const HOUR_EVENTS = [
  'draining',
  'meeting',
  'game',
  'longPhone',
  'focusEnd',
] as const;
/**
 * The most notifications within ten minutes that began in the hour: kept, not shown — what a
 * burst is depends on the user's own usual (see the hourly source).
 */
export const NOTIFICATION_PEAK = '_notificationPeak';

/** Draining again after this long without it is a new start. */
const DRAINING_GAP_MS = 15 * MINUTE;
/** A meeting or a game is one run with gaps up to this … */
const RUN_GAP_MS = 5 * MINUTE;
/** … and counts as begun when it lasts this long. */
const MEETING_MS = 5 * MINUTE;
const GAME_MS = 10 * MINUTE;
/** A phone session this long (gaps under a minute) is a long one. */
const LONG_PHONE_MS = 20 * MINUTE;
const BURST_MS = 10 * MINUTE;

/** The numbers of each hour 0…23 of the day by key (`deepWork`, `event.game`…); 0s left out. */
export function dayHours(day: DayMoments): Map<number, Map<string, number>> {
  const result = new Map<number, Map<string, number>>();
  const add = (hour: number, key: string, value: number) => {
    if (hour < 0 || value <= 0) {
      return;
    }
    const of = result.get(hour) ?? new Map<string, number>();
    of.set(key, (of.get(key) ?? 0) + value);
    result.set(hour, of);
  };
  const starts = [...Array(25).keys()].map(hour => wallClock(day, hour));
  const hourAt = (at: number) => {
    if (at < starts[0] || at >= starts[24]) {
      return -1;
    }
    let hour = 0;
    while (starts[hour + 1] <= at) {
      hour++;
    }
    return hour;
  };
  // The minutes of the parts in each hour they touch.
  const spread = (key: string, parts: {start: number; end: number}[]) => {
    for (const part of union(parts)) {
      for (let hour = 0; hour < 24; hour++) {
        const inside =
          Math.min(part.end, starts[hour + 1]) -
          Math.max(part.start, starts[hour]);
        add(hour, key, inside / MINUTE);
      }
    }
  };
  const count = (key: string, moments: number[]) => {
    for (const at of moments) {
      add(hourAt(at), key, 1);
    }
  };
  const mark = (key: string, moments: number[]) => {
    for (const hour of new Set(moments.map(hourAt))) {
      add(hour, `event.${key}`, 1);
    }
  };

  const computer = merge(day.spans.filter(span => span.device === 'computer'));
  const phone = merge(day.spans.filter(span => span.device === 'phone'));
  const screens = day.spans.filter(span => span.device !== 'browser');
  const ofCategory = (category: string) =>
    screens.filter(span => span.category === category);
  const draining = day.spans.filter(span => isDraining(span.app));

  spread('computer', computer);
  spread('phone', phone);
  spread('deepWork', deepRuns(computer, day.notifications));
  spread('focus', day.focus);
  spread('draining', draining);
  spread('meetings', ofCategory('meetings'));
  spread('games', ofCategory('games'));
  count('unlocks', day.unlocks);
  count('notifications', day.notifications);
  count(
    'switches',
    computer
      .filter(
        (span, index) =>
          index > 0 &&
          span.app !== computer[index - 1].app &&
          span.start - computer[index - 1].end <= MINUTE,
      )
      .map(span => span.start),
  );

  // The busiest ten minutes beginning in each hour.
  const posted = [...day.notifications].sort((a, b) => a - b);
  const peaks = new Map<number, number>();
  posted.forEach((at, index) => {
    let last = index;
    while (last + 1 < posted.length && posted[last + 1] < at + BURST_MS) {
      last++;
    }
    const hour = hourAt(at);
    peaks.set(hour, Math.max(peaks.get(hour) ?? 0, last - index + 1));
  });
  for (const [hour, peak] of peaks) {
    add(hour, NOTIFICATION_PEAK, peak);
  }

  mark(
    'draining',
    runs(draining, DRAINING_GAP_MS).map(run => run.start),
  );
  mark(
    'meeting',
    runs(ofCategory('meetings'), RUN_GAP_MS)
      .filter(run => run.end - run.start >= MEETING_MS)
      .map(run => run.start),
  );
  mark(
    'game',
    runs(ofCategory('games'), RUN_GAP_MS)
      .filter(run => run.end - run.start >= GAME_MS)
      .map(run => run.start),
  );
  mark(
    'longPhone',
    runs(phone, MINUTE)
      .filter(run => run.end - run.start >= LONG_PHONE_MS)
      .map(run => run.end),
  );
  mark(
    'focusEnd',
    day.focus.map(session => session.end),
  );

  // Minutes to one decimal: a day's hours are kept, and noise digits churn the sync. An hour is
  // 60 minutes at most, even the one the clocks go back in (it lasts two).
  const minutes = new Set<string>(HOURLY_MINUTES);
  for (const of of result.values()) {
    for (const [key, value] of of) {
      const capped = minutes.has(key) ? Math.min(60, value) : value;
      of.set(key, Math.round(capped * 10) / 10);
    }
  }
  return result;
}

/** Stretches with gaps up to `gap` between them, as one run each. */
function runs(
  spans: Pick<IndexSpan, 'start' | 'end'>[],
  gap: number,
): {start: number; end: number}[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const result: {start: number; end: number}[] = [];
  for (const span of sorted) {
    const last = result[result.length - 1];
    if (last && span.start - last.end <= gap) {
      last.end = Math.max(last.end, span.end);
    } else {
      result.push({start: span.start, end: span.end});
    }
  }
  return result;
}
