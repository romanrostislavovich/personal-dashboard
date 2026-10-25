import { PhoneLocationInput } from './activity-places';

/** A place Google named in its timeline: kept as the found name of that place. */
export interface TimelinePlaceName {
  latitude: number;
  longitude: number;
  name: string;
}

export interface ParsedTimeline {
  locations: PhoneLocationInput[];
  names: TimelinePlaceName[];
}

/** A visit becomes a fix this often over its time: enough for a stay, few for a year. */
const VISIT_STEP_MS = 5 * 60_000;
const VISIT_ACCURACY_M = 30;
const PATH_ACCURACY_M = 25;

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** `"52.2297°, 21.0122°"`, `"geo:52.2297,21.0122"` → the point. */
function pointOfText(text: unknown): { latitude: number; longitude: number } | null {
  if (typeof text !== 'string') {
    return null;
  }
  const match = text.replace('geo:', '').match(/(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)/);
  return match ? { latitude: Number(match[1]), longitude: Number(match[2]) } : null;
}

/** `{ latitudeE7, longitudeE7 }` or `{ latE7, lngE7 }` → the point. */
function pointOfE7(value: unknown): { latitude: number; longitude: number } | null {
  if (!isObject(value)) {
    return null;
  }
  const lat = num(value['latitudeE7'] ?? value['latE7']);
  const lon = num(value['longitudeE7'] ?? value['lngE7']);
  return lat === null || lon === null ? null : { latitude: lat / 1e7, longitude: lon / 1e7 };
}

function timeOf(value: unknown): number | null {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(ms) ? null : ms;
}

class Collector {
  readonly locations: PhoneLocationInput[] = [];
  readonly names: TimelinePlaceName[] = [];

  fix(point: { latitude: number; longitude: number } | null, at: number | null, accuracy: number) {
    if (!point || at === null || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
      return;
    }
    this.locations.push({ at: new Date(at).toISOString(), ...point, accuracy });
  }

  visit(
    point: { latitude: number; longitude: number } | null,
    start: number | null,
    end: number | null,
    name?: unknown,
  ) {
    if (!point || start === null || end === null || end < start) {
      return;
    }
    for (let at = start; at <= end; at += VISIT_STEP_MS) {
      this.fix(point, at, VISIT_ACCURACY_M);
    }
    this.fix(point, end, VISIT_ACCURACY_M);
    if (typeof name === 'string' && name.trim()) {
      this.names.push({ ...point, name: name.trim() });
    }
  }
}

/** The old Takeout: `Records.json` — every raw fix. */
function records(json: Json, out: Collector): void {
  for (const item of (json['locations'] as unknown[]) ?? []) {
    if (isObject(item)) {
      out.fix(
        pointOfE7(item),
        timeOf(item['timestamp'] ?? item['timestampMs']),
        num(item['accuracy']) ?? 100,
      );
    }
  }
}

/** The old Takeout: `Semantic Location History/2023/2023_MAY.json` — visits and trips. */
function semantic(json: Json, out: Collector): void {
  for (const item of (json['timelineObjects'] as unknown[]) ?? []) {
    if (!isObject(item)) {
      continue;
    }
    const visit = item['placeVisit'];
    if (isObject(visit) && isObject(visit['duration'])) {
      const location = isObject(visit['location']) ? visit['location'] : {};
      out.visit(
        pointOfE7(location),
        timeOf(visit['duration']['startTimestamp'] ?? visit['duration']['startTimestampMs']),
        timeOf(visit['duration']['endTimestamp'] ?? visit['duration']['endTimestampMs']),
        location['name'],
      );
    }
    const segment = item['activitySegment'];
    if (isObject(segment)) {
      const raw = isObject(segment['simplifiedRawPath']) ? segment['simplifiedRawPath'] : {};
      for (const point of (raw['points'] as unknown[]) ?? []) {
        if (isObject(point)) {
          out.fix(
            pointOfE7(point),
            timeOf(point['timestamp'] ?? point['timestampMs']),
            PATH_ACCURACY_M,
          );
        }
      }
    }
  }
}

/** The new on-device export: `Timeline.json` (`semanticSegments`, `rawSignals`) or an array. */
function segments(items: unknown[], out: Collector): void {
  for (const item of items) {
    if (!isObject(item)) {
      continue;
    }
    const start = timeOf(item['startTime']);
    const end = timeOf(item['endTime']);
    const visit = item['visit'];
    if (isObject(visit) && isObject(visit['topCandidate'])) {
      const place = visit['topCandidate']['placeLocation'];
      out.visit(pointOfText(isObject(place) ? place['latLng'] : place), start, end);
    }
    for (const step of (item['timelinePath'] as unknown[]) ?? []) {
      if (!isObject(step)) {
        continue;
      }
      const offset = num(step['durationMinutesOffsetFromStartTime']);
      const at =
        timeOf(step['time']) ??
        (start !== null && offset !== null ? start + offset * 60_000 : null);
      out.fix(pointOfText(step['point']), at, PATH_ACCURACY_M);
    }
  }
}

function rawSignals(items: unknown[], out: Collector): void {
  for (const item of items) {
    const position = isObject(item) ? item['position'] : null;
    if (isObject(position)) {
      out.fix(
        pointOfText(position['LatLng'] ?? position['latLng']),
        timeOf(position['timestamp']),
        num(position['accuracyMeters']) ?? 100,
      );
    }
  }
}

/**
 * The fixes of a Google Maps timeline, from any of its exports: the old Takeout (`Records.json`,
 * the monthly `Semantic Location History` files) and the new one from the phone (`Timeline.json`,
 * `location-history.json`). A visit becomes a fix every five minutes; the names Google knew
 * come along. Oldest first, one fix a minute at most.
 */
export function parseGoogleTimeline(json: unknown): ParsedTimeline {
  const out = new Collector();
  if (Array.isArray(json)) {
    segments(json, out);
  } else if (isObject(json)) {
    records(json, out);
    semantic(json, out);
    segments((json['semanticSegments'] as unknown[]) ?? [], out);
    rawSignals((json['rawSignals'] as unknown[]) ?? [], out);
  }
  const byMinute = new Map<number, PhoneLocationInput>();
  for (const fix of out.locations) {
    const minute = Math.floor(Date.parse(fix.at) / 60_000);
    const kept = byMinute.get(minute);
    if (!kept || fix.accuracy < kept.accuracy) {
      byMinute.set(minute, fix);
    }
  }
  return {
    locations: [...byMinute.values()].sort((a, b) => a.at.localeCompare(b.at)),
    names: out.names,
  };
}
