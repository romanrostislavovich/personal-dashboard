import {z} from 'zod';
import {LocalDate} from './local-date';

// How the phone is used (the Android app, stage 2 of docs/proposals/mobile-app.md): how often it
// is picked up, and how long it is looked at late at night.

const moment = z.iso.datetime({offset: true});
const LOCAL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The moments the phone was unlocked, as Android tells them. */
export const phoneUnlockIngestSchema = z.object({
  unlocks: z.array(moment).max(500),
});
export type PhoneUnlockIngest = z.infer<typeof phoneUnlockIngestSchema>;

export const phoneUsageQuerySchema = z.object({
  from: LOCAL_DATE,
  to: LOCAL_DATE,
});
export type PhoneUsageQuery = z.infer<typeof phoneUsageQuerySchema>;

/**
 * A day of the phone. A night belongs to the evening it began on (23:00–04:00, like late games):
 * the use after midnight counts to the day before.
 */
export interface PhoneUsageDay {
  day: LocalDate;
  unlocks: number;
  /** In apps of the phone from 23:00 to 04:00. */
  nightSeconds: number;
}

/** Activity → Phone: unlocks and the night, day by day. */
export interface PhoneUsage {
  /** Only the days with something. */
  days: PhoneUsageDay[];
  unlocks: number;
  nightSeconds: number;
  /** The hour of the day (0–23) of each unlock, summed over the period. */
  unlocksByHour: number[];
}

/** The kinds of the phone's signals (docs/telemetry.md, the phone's collectors 1–15). */
export const PHONE_SIGNAL_KINDS = [
  'screenOn',
  'screenOff',
  'charging',
  'wifi',
  'bluetooth',
  'media',
  'dnd',
  'ringer',
  'call',
  'photo',
  'noise',
  'light',
  'pressure',
  'alarm',
  'country',
  'battery',
  'headphones',
  'notificationReaction',
] as const;
export type PhoneSignalKind = (typeof PHONE_SIGNAL_KINDS)[number];

/** The numbers of a day the phone counts itself (steps; mobile data per app; Wi-Fi in all). */
export const PHONE_DAILY_KINDS = ['steps', 'mobileBytes', 'wifiBytes'] as const;

export const phoneSignalIngestSchema = z.object({
  signals: z
    .array(
      z.object({
        kind: z.enum(PHONE_SIGNAL_KINDS),
        at: moment,
        /** What the signal tells (a call's length, a network's name…); stored encrypted. */
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(500),
  daily: z
    .array(
      z.object({
        day: LOCAL_DATE,
        kind: z.enum(PHONE_DAILY_KINDS),
        key: z.string().max(200).default(''),
        value: z.number().min(0),
      }),
    )
    .max(2000)
    .default([]),
});
export type PhoneSignalIngest = z.input<typeof phoneSignalIngestSchema>;

/** A day of the phone's signals, as Activity → Phone shows it; `null` — not told that day. */
export interface PhoneSignalsDay {
  day: LocalDate;
  /** The first unlock or screen-on after 4 am, and the last use before it (the clock). */
  firstUse: string | null;
  lastUse: string | null;
  /** The longest stretch of the night (20:00–12:00) with the screen off: a sleep proxy. */
  restHours: number | null;
  steps: number | null;
  /** Hours with headphones, in the car (by Bluetooth). */
  headphonesHours: number | null;
  carHours: number | null;
  /** Hours something played (music, podcasts, video). */
  mediaHours: number | null;
  dndHours: number | null;
  calls: number | null;
  callMinutes: number | null;
  /** How many different people were called or called. */
  people: number | null;
  photos: number | null;
  mobileMegabytes: number | null;
  /** The average noise level (dB, uncalibrated: for comparing days). */
  noiseDb: number | null;
  /** Hours in daylight (light over 1 000 lux). */
  daylightHours: number | null;
  /** The alarm set for this morning (the wake planned), `HH:MM`. */
  alarm: string | null;
  /** Of the notifications reacted to: the share opened (%), and the median seconds to open one. */
  notificationsOpened: number | null;
  secondsToOpen: number | null;
  /** The battery's highest temperature, °C. */
  batteryMaxC: number | null;
}

const appName = z.string().trim().max(200);
/** An app of the phone as the security report names it: its package and its label. */
const securityApp = z.object({
  package: z.string().trim().min(1).max(200),
  name: appName,
});

/**
 * What the phone tells about its own safety once a day (Security → Phone): the system and its
 * patch, the lock, the encryption, root; the apps with the strongest access, the apps that may
 * install others, the apps not from Google Play; the certificates added by hand, the Wi-Fi it is
 * on, a VPN. Developer options and USB debugging are told but are no finding (the owner's choice).
 */
export const phoneSecuritySchema = z.object({
  at: moment,
  android: z.object({
    release: z.string().max(20),
    sdk: z.number().int().min(1).max(100),
    /** `YYYY-MM-DD`; empty when the system does not tell. */
    securityPatch: z.string().max(20),
    model: z.string().max(100),
  }),
  /** A PIN, a pattern, a password or a fingerprint locks it. */
  screenLock: z.boolean(),
  /** `null` — the system does not tell. */
  encrypted: z.boolean().nullable(),
  rooted: z.boolean(),
  developerOptions: z.boolean(),
  usbDebugging: z.boolean(),
  /** Apps with device administrator rights, the system's own left out. */
  deviceAdmins: z.array(securityApp).max(50),
  /** Apps with an accessibility service on: they see and press everything on the screen. */
  accessibility: z.array(securityApp).max(50),
  /** Apps allowed to install other apps ("unknown sources"), the dashboard itself left out. */
  installers: z.array(securityApp).max(100),
  /** Apps installed by something other than Google Play (and not with the system). */
  notFromPlay: z
    .array(securityApp.extend({installer: z.string().max(200).nullable()}))
    .max(300),
  /** Certificate authorities added by the user: they can read the phone's HTTPS. */
  userCertificates: z.array(z.string().max(300)).max(50),
  wifi: z.object({name: z.string().max(100), open: z.boolean()}).nullable(),
  vpn: z.boolean(),
});
export type PhoneSecurity = z.infer<typeof phoneSecuritySchema>;
