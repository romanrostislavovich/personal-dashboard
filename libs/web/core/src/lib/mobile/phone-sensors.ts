import { registerPlugin } from '@capacitor/core';
import { isMobileApp } from './mobile-app';

/** What Android has allowed the app, and whether the collection is on. */
export interface PhoneSensorsStatus {
  configured: boolean;
  /** The time in apps (Usage access). */
  usageAccess: boolean;
  /** The notifications of other apps (Notification access). */
  notificationAccess: boolean;
  /** No battery limits in the background. */
  unrestricted: boolean;
}

interface PhoneSensorsPlugin {
  status(): Promise<PhoneSensorsStatus>;
  configure(options: { server: string; token: string }): Promise<void>;
  disable(): Promise<void>;
  syncNow(): Promise<void>;
  openUsageAccess(): Promise<void>;
  openNotificationAccess(): Promise<void>;
  openBattery(): Promise<void>;
  openAutostart(): Promise<void>;
}

/** How long the app may take to answer whether it can collect. */
const ANSWER_MS = 5_000;

/** The plugin, or why there is none: the card shows the reason, so a problem can be told. */
export type PhoneSensorsCheck =
  { plugin: PhoneSensorsPlugin; error: null } | { plugin: null; error: string | null };

/**
 * The phone as a sensor (PhoneSensorsPlugin in apps/mobile): its own collection in the
 * background sends the time in apps and the notifications to the Activity section with a device
 * token of its own. No plugin: not in the app (no error), or an app that cannot collect — built
 * before it, or one that does not answer (the error says which).
 */
export async function checkPhoneSensors(): Promise<PhoneSensorsCheck> {
  if (!isMobileApp()) {
    return { plugin: null, error: null };
  }
  const plugin = registerPlugin<PhoneSensorsPlugin>('PhoneSensors');
  try {
    await Promise.race([
      plugin.status(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`No answer in ${ANSWER_MS / 1000} s`)), ANSWER_MS),
      ),
    ]);
    return { plugin, error: null };
  } catch (error) {
    return { plugin: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function phoneSensors(): Promise<PhoneSensorsPlugin | null> {
  return (await checkPhoneSensors()).plugin;
}
