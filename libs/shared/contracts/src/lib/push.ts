import { z } from 'zod';

/**
 * Push notifications on a phone (the Android app, through Firebase Cloud Messaging), next to
 * Telegram: what the app tells the server, and what Settings → Notifications shows.
 */

/** The app on a phone says where it gets notifications: the token Firebase gave it. */
export const pushDeviceInputSchema = z.object({
  token: z.string().trim().min(10).max(4096),
  /** The phone's model, for the list: `Redmi Note 9 Pro`. */
  name: z.string().trim().min(1).max(100),
});
export type PushDeviceInput = z.infer<typeof pushDeviceInputSchema>;

export interface PushDevice {
  /** The app's own id on the phone (the same as in Settings → Apps). */
  id: string;
  name: string;
  createdAt: string;
  /** When a notification last reached Firebase for it; `null` — none yet. */
  lastSentAt: string | null;
}

export interface PushStatus {
  /** The owner of the dashboard sets the server's Firebase key. */
  owner: boolean;
  /** The server's Firebase key is set (by the owner): without it nothing is sent. */
  keySet: boolean;
  /** The Firebase project of the key, to tell it apart. */
  projectId: string | null;
  /** Why the key does not work now (the last attempt), for the owner. */
  keyError: string | null;
  /** The user's phones that get notifications. */
  devices: PushDevice[];
}

/** The owner's key: the JSON of a Firebase service account, as downloaded. */
export const pushKeySchema = z.object({
  serviceAccount: z.string().trim().min(100).max(10_000),
});
export type PushKey = z.infer<typeof pushKeySchema>;
