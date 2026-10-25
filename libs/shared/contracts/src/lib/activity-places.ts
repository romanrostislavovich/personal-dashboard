import { z } from 'zod';
import { LocalDate } from './local-date';

// The phone's location (the Android app, stage 2c of docs/proposals/mobile-app.md): where the
// day went — the places it was spent at and the trips between them.

const moment = z.iso.datetime({ offset: true });
const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** Where the phone was, as Android told it (a low-power fix: Wi-Fi and cell towers). */
export const phoneLocationSchema = z.object({
  at: moment,
  latitude,
  longitude,
  /** Meters, as Android estimates it. */
  accuracy: z.number().min(0).max(1_000_000),
});
export type PhoneLocationInput = z.infer<typeof phoneLocationSchema>;

export const phoneLocationIngestSchema = z.object({
  locations: z.array(phoneLocationSchema).max(500),
});
export type PhoneLocationIngest = z.infer<typeof phoneLocationIngestSchema>;

export const placesQuerySchema = z.object({ day: LOCAL_DATE });
export type PlacesQuery = z.infer<typeof placesQuerySchema>;

/** A place the user named ("Home", "Work"): the stays within its radius take its name. */
export interface NamedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

export const placeInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  latitude,
  longitude,
  radiusM: z.number().int().min(50).max(2000).default(150),
});
export type PlaceInput = z.infer<typeof placeInputSchema>;

export const placeUpdateSchema = z.object({ name: z.string().trim().min(1).max(60) });
export type PlaceUpdate = z.infer<typeof placeUpdateSchema>;

/** A part of the day: a time spent in one place, or a trip from one place to the next. */
export type PlacesEntry =
  | {
      kind: 'stay';
      /** The named place it was at; `null` — a place with no name yet. */
      placeId: string | null;
      name: string | null;
      latitude: number;
      longitude: number;
      startedAt: string;
      endedAt: string;
    }
  | {
      kind: 'trip';
      startedAt: string;
      endedAt: string;
      /** Along the points known: a straight line between them, so a little less than the road. */
      meters: number;
    };

/** A place often visited lately (the last 30 days), named or not. */
export interface FrequentPlace {
  placeId: string | null;
  name: string | null;
  latitude: number;
  longitude: number;
  seconds: number;
  visits: number;
  lastAt: string;
}

/** Activity → Places: one day in places and trips, and the places of the last 30 days. */
export interface PlacesOverview {
  day: LocalDate;
  /** In the order of the day. */
  entries: PlacesEntry[];
  /** The trips of the day together. */
  meters: number;
  /** Fixes of the day: none — the phone told nothing (location not allowed, or switched off). */
  points: number;
  frequent: FrequentPlace[];
  named: NamedPlace[];
}
