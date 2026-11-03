import {Achievement} from './achievements';

/**
 * Events the server pushes to an open dashboard (`GET /api/events`, Server-Sent Events).
 * The web app shows them as toasts; the desktop app also as system notifications.
 */
export type RealtimeEvent =
  | {type: 'achievements'; achievements: Achievement[]}
  | {
      type: 'notification';
      title: string;
      body: string;
      source: string;
      /** The desktop app may show it as a system notification (not in the quiet hours…). */
      system?: boolean;
      /** The page a click on it opens. */
      route?: string;
    }
  /** The bell changed: a notification came, was read or answered (on any device). */
  | {type: 'inbox'}
  /**
   * Switch the VPN of one device (VPN section): the desktop app whose computer it is starts or
   * stops its tunnel; `killSwitch` picks the tunnel that blocks around the VPN.
   */
  | {type: 'vpn'; deviceId: string; up: boolean; killSwitch: boolean}
  /** Keeps proxies from closing an idle connection; the client ignores it. */
  | {type: 'ping'};
