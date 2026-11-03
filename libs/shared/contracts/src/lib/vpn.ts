import {z} from 'zod';

// The VPN module: AmneziaWG on the dashboard's server and the devices allowed into it
// (see libs/modules/vpn and deploy/vpn).

export const VPN_DEVICE_KINDS = ['phone', 'computer', 'other'] as const;
export type VpnDeviceKind = (typeof VPN_DEVICE_KINDS)[number];

export const vpnDeviceInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(VPN_DEVICE_KINDS),
});
export type VpnDeviceInput = z.infer<typeof vpnDeviceInputSchema>;

export const vpnDeviceRenameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export type VpnDeviceRename = z.infer<typeof vpnDeviceRenameSchema>;

/** A device and what it did last; never its keys (those are in VpnDeviceConfig). */
export interface VpnDevice {
  id: string;
  name: string;
  kind: VpnDeviceKind;
  /** Inside the tunnel, `10.77.0.N`. */
  address: string;
  createdAt: string;
  /** `null` — it has never connected: the config was not set up on it yet. */
  firstConnectedAt: string | null;
  lastHandshakeAt: string | null;
  /** Connected now (a handshake within the last 3 minutes). */
  online: boolean;
  /** The address it came from last. */
  lastAddress: string | null;
  /** Bytes both ways today (in the user's time zone). */
  todayBytes: number;
  /** Networks it came from in the last 90 days, the latest first. */
  networks: VpnNetwork[];
}

export interface VpnNetwork {
  /** `93.84.0.0/16` or an IPv6 `/48`. */
  network: string;
  address: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * `off` — this instance has no VPN (a computer, or the server without deploy/vpn);
 * `starting` — set up, but the container has not answered yet; `up` / `down` by its status file.
 */
export const VPN_STATES = ['off', 'starting', 'up', 'down'] as const;
export type VpnState = (typeof VPN_STATES)[number];

export interface VpnStatus {
  state: VpnState;
  /** `vpn.example.com:37853`, `null` before the server made its keys. */
  endpoint: string | null;
  /** When the container last told about itself. */
  statusAt: string | null;
  devices: VpnDevice[];
  /** Bytes both ways today, all devices. */
  todayBytes: number;
}

/** A day of all devices: bytes each way, minutes any device was connected. */
export interface VpnDay {
  day: string;
  rxBytes: number;
  txBytes: number;
  onlineMinutes: number;
}

/** The text of a device's config (a file for the AmneziaWG app, or a QR code of it). */
export interface VpnDeviceConfig {
  name: string;
  config: string;
}
