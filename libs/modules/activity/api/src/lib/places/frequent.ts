import { distanceM, PLACE_RADIUS_M, Point, Stay } from './stays';

export interface Named extends Point {
  id: string;
  name: string;
  radiusM: number;
}

export interface Frequent extends Point {
  placeId: string | null;
  name: string | null;
  seconds: number;
  visits: number;
  /** Milliseconds. */
  lastAt: number;
}

/** The named place a point is in: the nearest one whose radius takes it. */
export function namedAt(point: Point, named: Named[]): Named | null {
  let best: Named | null = null;
  let bestM = Infinity;
  for (const place of named) {
    const meters = distanceM(point, place);
    if (meters <= place.radiusM && meters < bestM) {
      best = place;
      bestM = meters;
    }
  }
  return best;
}

/**
 * The places the stays were at: a named place takes the stays in its radius; the others gather
 * around the longest stays near them, so a place with no name yet is one place on every day, not
 * a new one each time. `placeOf` tells the place of each stay.
 */
export function gatherPlaces(
  stays: Stay[],
  named: Named[],
): { places: Frequent[]; placeOf: Map<Stay, Frequent> } {
  const places: Frequent[] = named.map((place) => ({
    placeId: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    seconds: 0,
    visits: 0,
    lastAt: 0,
  }));
  const placeOf = new Map<Stay, Frequent>();
  const longestFirst = [...stays].sort((a, b) => b.end - b.start - (a.end - a.start));
  for (const stay of longestFirst) {
    const seconds = Math.round((stay.end - stay.start) / 1000);
    const known = namedAt(stay, named);
    let place = known ? places.find((item) => item.placeId === known.id) : undefined;
    if (!place) {
      place = places.find((item) => !item.placeId && distanceM(item, stay) <= PLACE_RADIUS_M);
    }
    if (!place) {
      place = {
        placeId: null,
        name: null,
        latitude: stay.latitude,
        longitude: stay.longitude,
        seconds: 0,
        visits: 0,
        lastAt: 0,
      };
      places.push(place);
    } else if (!place.placeId) {
      // The middle moves towards where the time went.
      const total = place.seconds + seconds;
      if (total > 0) {
        place.latitude = (place.latitude * place.seconds + stay.latitude * seconds) / total;
        place.longitude = (place.longitude * place.seconds + stay.longitude * seconds) / total;
      }
    }
    place.seconds += seconds;
    place.visits += 1;
    place.lastAt = Math.max(place.lastAt, stay.end);
    placeOf.set(stay, place);
  }
  return { places: places.filter((place) => place.visits > 0), placeOf };
}

/** The places the stays were at, the most time first. */
export function frequentPlaces(stays: Stay[], named: Named[], limit: number): Frequent[] {
  return gatherPlaces(stays, named)
    .places.sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
}
