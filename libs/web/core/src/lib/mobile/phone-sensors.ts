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

/**
 * The phone as a sensor (PhoneSensorsPlugin in apps/mobile): its own collection in the
 * background sends the time in apps and the notifications to the Activity section with a device
 * token of its own. `null` — not in the app, or an app built before it.
 */
export async function phoneSensors(): Promise<PhoneSensorsPlugin | null> {
  if (!isMobileApp()) {
    return null;
  }
  const plugin = registerPlugin<PhoneSensorsPlugin>('PhoneSensors');
  try {
    await plugin.status();
    return plugin;
  } catch {
    return null; // An older APK: the collection needs the new one.
  }
}
