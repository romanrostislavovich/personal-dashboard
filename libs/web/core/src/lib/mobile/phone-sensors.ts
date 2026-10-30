import {registerPlugin} from '@capacitor/core';
import {isMobileApp} from './mobile-app';

/** What Android has allowed the app, and whether the collection is on. */
export interface PhoneSensorsStatus {
  configured: boolean;
  /** The time in apps (Usage access). */
  usageAccess: boolean;
  /** The notifications of other apps (Notification access). */
  notificationAccess: boolean;
  /** No battery limits in the background. */
  unrestricted: boolean;
  /** The location all the time (places and trips); missing — an APK built before it. */
  location?: boolean;
  /** The optional signals (docs/telemetry.md); missing — an APK built before them. */
  steps?: boolean;
  calls?: boolean;
  photos?: boolean;
  microphone?: boolean;
  /** Android 12 and later only. */
  bluetooth?: boolean;
  /** The band through Health Connect: Android 14 and later only. */
  health?: boolean;
}

/** The voice assistant of the phone (VoiceService in apps/mobile). */
export interface VoiceStatus {
  enabled: boolean;
  /** The word it answers to, lower case. */
  name: string;
  /** The speech model on the phone: `none`, `downloading` (with `progress`), `ready`, `failed`. */
  model: 'none' | 'downloading' | 'ready' | 'failed';
  progress: number;
  /** Whether the model knows the name; missing — not checked yet (no model). */
  known?: boolean;
  microphone: boolean;
  error: string;
  lastQuestion: string;
  lastAnswer: string;
  lastAt: number;
}

/** The optional signals of the phone, each a permission of its own. */
export type PhoneExtra =
  'steps' | 'calls' | 'photos' | 'microphone' | 'bluetooth' | 'health';

interface PhoneSensorsPlugin {
  status(): Promise<PhoneSensorsStatus>;
  configure(options: {server: string; token: string}): Promise<void>;
  disable(): Promise<void>;
  syncNow(): Promise<void>;
  openUsageAccess(): Promise<void>;
  openNotificationAccess(): Promise<void>;
  openBattery(): Promise<void>;
  /** Android's question about the location, or the app's settings once it was asked. */
  openLocation(): Promise<void>;
  /** Android's question about one optional signal, or the app's settings once it was asked. */
  allow(options: {kind: PhoneExtra}): Promise<void>;
  openAutostart(): Promise<void>;
  /** Missing in an APK built before the voice assistant. */
  voiceStatus?(): Promise<VoiceStatus>;
  voiceConfigure?(options: {
    enabled: boolean;
    name: string;
  }): Promise<VoiceStatus>;
  voiceTry?(): Promise<void>;
}

/** How long the app may take to answer whether it can collect. */
const ANSWER_MS = 5_000;

/** Registered once: Capacitor warns on each registration after the first. */
let registered: PhoneSensorsPlugin | undefined;

/**
 * The plugin, or why there is none: the card shows the reason, so a problem can be told.
 * Always inside an object: the plugin is a Proxy that turns any property into a native call,
 * `then` too, so an async function returning it bare waits for good on a `then` nobody answers.
 */
export type PhoneSensorsCheck =
  | {plugin: PhoneSensorsPlugin; error: null}
  | {plugin: null; error: string | null};

/**
 * The phone as a sensor (PhoneSensorsPlugin in apps/mobile): its own collection in the
 * background sends the time in apps and the notifications to the Activity section with a device
 * token of its own. No plugin: not in the app (no error), or an app that cannot collect — built
 * before it, or one that does not answer (the error says which).
 */
export async function checkPhoneSensors(): Promise<PhoneSensorsCheck> {
  if (!isMobileApp()) {
    return {plugin: null, error: null};
  }
  registered ??= registerPlugin<PhoneSensorsPlugin>('PhoneSensors');
  const plugin = registered;
  try {
    await Promise.race([
      plugin.status(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`No answer in ${ANSWER_MS / 1000} s`)),
          ANSWER_MS,
        ),
      ),
    ]);
    return {plugin, error: null};
  } catch (error) {
    return {
      plugin: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
