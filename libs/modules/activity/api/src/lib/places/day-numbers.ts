import { LocalDate } from '@pd/contracts';
import { Frequent, gatherPlaces, Named } from './frequent';
import { Entry, Stay } from './stays';

/** A day of the places, the numbers that go to Links and Life. */
export interface PlaceDayNumbers {
  day: LocalDate;
  walkSeconds: number;
  /** On the way, however it went. */
  tripSeconds: number;
  /** `null` — no home is known yet. */
  homeSeconds: number | null;
  /** Places first seen this day (not in the history before it). */
  newPlaces: number;
}

export interface DayOfPlaces {
  day: LocalDate;
  /** The local midnight that starts it, ms. */
  start: number;
  entries: Entry[];
}

const HOUR_MS = 3_600_000;
/** Where the phone is at this hour of the night most often is home. */
const NIGHT_HOUR = 3;

function seconds(entry: { start: number; end: number }): number {
  return Math.round((entry.end - entry.start) / 1000);
}

/** Home: the place the phone spent 3 am at on the most nights; `null` — no night known. */
export function homeOf(days: DayOfPlaces[], placeOf: Map<Stay, Frequent>): Frequent | null {
  const nights = new Map<Frequent, number>();
  for (const day of days) {
    const night = day.start + NIGHT_HOUR * HOUR_MS;
    for (const entry of day.entries) {
      if (entry.kind === 'stay' && entry.start <= night && entry.end > night) {
        const place = placeOf.get(entry);
        if (place) {
          nights.set(place, (nights.get(place) ?? 0) + 1);
        }
      }
    }
  }
  let home: Frequent | null = null;
  for (const [place, count] of nights) {
    if (!home || count > (nights.get(home) ?? 0)) {
      home = place;
    }
  }
  return home;
}

/**
 * The numbers of the days `from` on; the days before it are the history: home is found over all
 * of them, and a place is new only if the history has not seen it.
 */
export function placeDayNumbers(
  days: DayOfPlaces[],
  named: Named[],
  from: LocalDate,
): PlaceDayNumbers[] {
  const stays = days.flatMap((day) =>
    day.entries.filter((entry): entry is Entry & { kind: 'stay' } => entry.kind === 'stay'),
  );
  const { placeOf } = gatherPlaces(stays, named);
  const home = homeOf(days, placeOf);
  const seen = new Set<Frequent>();
  const numbers: PlaceDayNumbers[] = [];
  for (const day of days) {
    let walkSeconds = 0;
    let tripSeconds = 0;
    let homeSeconds = 0;
    let newPlaces = 0;
    for (const entry of day.entries) {
      if (entry.kind === 'trip') {
        tripSeconds += seconds(entry);
        walkSeconds += entry.mode === 'walk' ? seconds(entry) : 0;
        continue;
      }
      const place = placeOf.get(entry);
      if (!place) {
        continue;
      }
      if (place === home) {
        homeSeconds += seconds(entry);
      }
      if (!seen.has(place)) {
        seen.add(place);
        newPlaces += 1;
      }
    }
    if (day.day >= from) {
      numbers.push({
        day: day.day,
        walkSeconds,
        tripSeconds,
        homeSeconds: home ? homeSeconds : null,
        newPlaces,
      });
    }
  }
  return numbers;
}
