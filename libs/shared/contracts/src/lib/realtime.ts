import { Achievement } from './achievements';

/**
 * Events the server pushes to an open dashboard (`GET /api/events`, Server-Sent Events).
 * The web app shows them as toasts; the desktop app also as system notifications.
 */
export type RealtimeEvent =
  | { type: 'achievements'; achievements: Achievement[] }
  | { type: 'notification'; title: string; body: string; source: string }
  /** Keeps proxies from closing an idle connection; the client ignores it. */
  | { type: 'ping' };
