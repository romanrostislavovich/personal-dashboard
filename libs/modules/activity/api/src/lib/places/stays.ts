import { TripMode } from '@pd/contracts';

/** A fix of the phone's location; `at` in milliseconds. */
export interface Fix {
  at: number;
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface Point {
  latitude: number;
  longitude: number;
}

/** A time spent in one place: from its first fix to its last. */
export interface Stay extends Point {
  start: number;
  end: number;
}

/** From one stay to the next, along the fixes taken on the way. */

export interface Trip {
  start: number;
  end: number;
  meters: number;
  mode: TripMode;
  /** The way, from the stay before to the stay after: the line on the map. */
  path: Point[];
}

export type Entry = ({ kind: 'stay' } & Stay) | ({ kind: 'trip' } & Trip);

/** Fixes farther than this from a place's middle are elsewhere. */
export const PLACE_RADIUS_M = 200;
/** A fix less sure than this (a cell tower far away) tells nothing about the place. */
const MAX_ACCURACY_M = 500;
/**
 * How far from a place's middle a fix may be and still be there: as far as the fix is unsure,
 * between these. A GPS fix 60 m off is on its way (a short walk is a trip, not part of a stay);
 * a cell fix 150 m off is still at home.
 */
const REACH_MIN_M = 50;
const REACH_PER_ACCURACY = 1.5;

function reachOf(fix: Fix): number {
  return Math.min(PLACE_RADIUS_M, Math.max(REACH_MIN_M, fix.accuracy * REACH_PER_ACCURACY));
}

/** On the move the phone takes GPS fixes this sure: the way goes by them, not the rough ones. */
const PRECISE_M = 50;
/** km/h: slower is on foot, then a bike, faster is riding. */
const WALK_KMH = 7;
const BIKE_KMH = 25;

/**
 * Shorter is passing by. Ten minutes in one place is a stay whether the phone told it every
 * minute or every quarter of an hour (two fixes in a row).
 */
const MIN_STAY_MS = 10 * 60_000;
/**
 * Fixes away from a place this long in a row: the phone left it. Shorter, and back near it, they
 * were noise — indoors GPS wanders by tens of metres every few seconds, past the reach of its own
 * accuracy, and each such fix starting a group of its own left no group ten minutes long.
 */
const LEFT_MS = 5 * 60_000;

const EARTH_M = 6_371_000;

/** The distance on the Earth's surface (haversine). */
export function distanceM(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

function middle(fixes: Fix[]): Point {
  const sum = fixes.reduce(
    (acc, fix) => ({
      latitude: acc.latitude + fix.latitude,
      longitude: acc.longitude + fix.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return { latitude: sum.latitude / fixes.length, longitude: sum.longitude / fixes.length };
}

/**
 * The day as stays and trips. Fixes in a row near one middle are a place (a few minutes away
 * from it and back are noise); one that was there long enough is a stay, the rest are fixes on
 * the way. Two stays in a row at one place (a fix gone astray between them) are one. A trip is
 * everything between two stays.
 */
export function entriesOf(input: Fix[]): Entry[] {
  const fixes = input.filter((fix) => fix.accuracy <= MAX_ACCURACY_M).sort((a, b) => a.at - b.at);

  // Groups of fixes in a row near one middle; a group long enough is a stay.
  const groups: { fixes: Fix[]; middle: Point }[] = [];
  // The first fix away from the last group since the last one near it; -1 — none.
  let away = -1;
  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    const last = groups[groups.length - 1];
    if (last && distanceM(last.middle, fix) <= reachOf(fix)) {
      // Back near it: the fixes away were noise, not a leave.
      away = -1;
      last.fixes.push(fix);
      last.middle = middle(last.fixes);
      continue;
    }
    if (away < 0) {
      away = i;
    }
    const left = !last || fix.at - fixes[away].at >= LEFT_MS || i === fixes.length - 1;
    if (left) {
      // A new group from the first fix away; the fixes after it are read again against it.
      groups.push({ fixes: [fixes[away]], middle: fixes[away] });
      i = away;
      away = -1;
    }
  }

  const stays: (Stay & { fixes: Fix[] })[] = [];
  const onTheWay: Fix[][] = [[]];
  for (const group of groups) {
    const start = group.fixes[0].at;
    const end = group.fixes[group.fixes.length - 1].at;
    if (end - start < MIN_STAY_MS) {
      onTheWay[onTheWay.length - 1].push(...group.fixes);
      continue;
    }
    const previous = stays[stays.length - 1];
    if (previous && distanceM(previous, group.middle) <= PLACE_RADIUS_M) {
      // Back at the same place: whatever was between was noise, not a trip.
      previous.fixes.push(...group.fixes);
      Object.assign(previous, middle(previous.fixes), { end });
      onTheWay[onTheWay.length - 1] = [];
      continue;
    }
    stays.push({ ...group.middle, start, end, fixes: [...group.fixes] });
    onTheWay.push([]);
  }

  const entries: Entry[] = [];
  stays.forEach((stay, i) => {
    if (i > 0) {
      const from = stays[i - 1];
      const way = onTheWay[i];
      const precise = way.filter((fix) => fix.accuracy <= PRECISE_M);
      const path: Point[] = [from, ...(precise.length ? precise : way), stay].map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      }));
      let meters = 0;
      for (let j = 1; j < path.length; j++) {
        meters += distanceM(path[j - 1], path[j]);
      }
      entries.push({
        kind: 'trip',
        start: from.end,
        end: stay.start,
        meters: Math.round(meters),
        mode: modeOf(meters, stay.start - from.end),
        path,
      });
    }
    entries.push({
      kind: 'stay',
      latitude: stay.latitude,
      longitude: stay.longitude,
      start: stay.start,
      end: stay.end,
    });
  });
  return entries;
}

/** The entries inside `[from, to)`: a stay over midnight counts on each day by its part. */
export function clip(entries: Entry[], from: number, to: number): Entry[] {
  return entries
    .filter((entry) => entry.end > from && entry.start < to)
    .map((entry) => ({
      ...entry,
      start: Math.max(entry.start, from),
      end: Math.min(entry.end, to),
    }))
    .filter((entry) => entry.kind === 'trip' || entry.end > entry.start);
}

/** By the average speed; a trip of no time (fixes a moment apart) is on foot. */
export function modeOf(meters: number, ms: number): TripMode {
  const kmh = ms > 0 ? meters / 1000 / (ms / 3_600_000) : 0;
  return kmh < WALK_KMH ? 'walk' : kmh < BIKE_KMH ? 'bike' : 'ride';
}

/** A stay whose last fix is this close to the latest one is going on now. */
const NOW_MS = 3 * 60_000;

/**
 * The stay going on at the last fix, if any: the phone stood there for ten minutes or more and
 * has not left since. `null` — on the way, or not there long enough yet.
 */
export function stayNow(fixes: Fix[]): Stay | null {
  if (!fixes.length) {
    return null;
  }
  const last = Math.max(...fixes.map((fix) => fix.at));
  const entries = entriesOf(fixes);
  const stay = entries[entries.length - 1];
  return stay?.kind === 'stay' && last - stay.end <= NOW_MS ? stay : null;
}
