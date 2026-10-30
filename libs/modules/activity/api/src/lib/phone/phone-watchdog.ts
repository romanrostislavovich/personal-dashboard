import {PhoneStream} from './phone-collection.schema';

const HOUR_MS = 3_600_000;

/**
 * How long each stream may be quiet before the phone is woken: the collection runs every
 * 15 minutes; the band writes to Health Connect when its app syncs (an hour or so behind); the
 * places service sends nothing new while the phone lies still (gaps of three hours are usual).
 */
export const QUIET_MS: Record<PhoneStream, number> = {
  collection: 2 * HOUR_MS,
  band: 6 * HOUR_MS,
  places: 12 * HOUR_MS,
};
/** Woken this long and still quiet: the owner is told, once (the owner's choice, 2026-10-30). */
export const TELL_AFTER_MS = 24 * HOUR_MS;
/** A silent push at most this often. */
export const REVIVE_EVERY_MS = HOUR_MS;

/** What the watchdog knows of a phone. */
export interface PhoneWatch {
  collectedAt: Date;
  healthAllowed: boolean;
  healthNewestAt: Date | null;
  locationAllowed: boolean;
  /** The newest location fix the server has from it. */
  lastFixAt: Date | null;
  revivedAt: Date | null;
  told: Partial<Record<PhoneStream, string>>;
}

export interface WatchVerdict {
  /** Wake the phone with a silent push now. */
  revive: boolean;
  /** The silences to tell the owner of, with the moment each began. */
  tell: {stream: PhoneStream; since: Date}[];
  told: Partial<Record<PhoneStream, string>>;
}

/** When each watched stream last gave something; a stream not watched is left out. */
function lastOf(
  watch: PhoneWatch,
  now: Date,
): Partial<Record<PhoneStream, Date>> {
  const last: Partial<Record<PhoneStream, Date>> = {
    collection: watch.collectedAt,
  };
  // The band is judged by the collection that reads it: a quiet collection says it all.
  const collecting =
    now.getTime() - watch.collectedAt.getTime() < QUIET_MS.collection;
  if (watch.healthAllowed && watch.healthNewestAt && collecting) {
    last.band = watch.healthNewestAt;
  }
  if (watch.locationAllowed && watch.lastFixAt) {
    last.places = watch.lastFixAt;
  }
  return last;
}

/**
 * What to do about a phone now: wake it when a stream is quiet past its limit (not more often
 * than hourly), and tell the owner of a silence that lasted a day — once for each silence.
 */
export function judgePhone(watch: PhoneWatch, now = new Date()): WatchVerdict {
  const told = {...watch.told};
  const tell: WatchVerdict['tell'] = [];
  let quiet = false;
  const last = lastOf(watch, now);
  for (const stream of Object.keys(QUIET_MS) as PhoneStream[]) {
    const at = last[stream];
    if (!at || now.getTime() - at.getTime() < QUIET_MS[stream]) {
      delete told[stream];
      continue;
    }
    quiet = true;
    const since = at.toISOString();
    if (
      now.getTime() - at.getTime() >= TELL_AFTER_MS &&
      told[stream] !== since
    ) {
      tell.push({stream, since: at});
      told[stream] = since;
    }
  }
  const revive =
    quiet &&
    (!watch.revivedAt ||
      now.getTime() - watch.revivedAt.getTime() >= REVIVE_EVERY_MS);
  return {revive, tell, told};
}
