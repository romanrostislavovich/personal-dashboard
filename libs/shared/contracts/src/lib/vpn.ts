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

/** `GET /api/vpn/days?days=` — how many days back, today included. */
export const vpnDaysQuerySchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(366)
  .default(30);

/** A device changed: its name, or whether the internet goes off when the VPN fails. */
export const vpnDeviceUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    killSwitch: z.boolean(),
  })
  .partial()
  .refine(input => Object.keys(input).length > 0, 'Nothing to change');
export type VpnDeviceUpdate = z.infer<typeof vpnDeviceUpdateSchema>;

/** `POST /api/vpn/devices/:id/switch` — the VPN on or off on that device, from anywhere. */
export const vpnSwitchSchema = z.object({up: z.boolean()});
export type VpnSwitch = z.infer<typeof vpnSwitchSchema>;

/** What a switch reached: the desktop apps get it live, the phones by a silent push. */
export interface VpnSwitchResult {
  device: string;
  up: boolean;
  /** Phones the silent push was sent to (0 — no phone with push, or not a phone). */
  phones: number;
}

/** A device and what it did last; never its keys (those are in VpnDeviceConfig). */
export interface VpnDevice {
  id: string;
  name: string;
  kind: VpnDeviceKind;
  /** Inside the tunnel, `10.77.0.N`. */
  address: string;
  /** The internet off when the VPN fails (see vpnDevices.killSwitch). */
  killSwitch: boolean;
  createdAt: string;
  /** `null` — it has never connected (or this is a copy that does not see the VPN). */
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
 * `off` — no VPN (the server without deploy/vpn); `remote` — the VPN runs on the server and this
 * is a copy of it (a computer that syncs): the devices are here, who is online is not;
 * `starting` — set up, but the container has not answered yet; `up` / `down` by its status file.
 */
export const VPN_STATES = ['off', 'remote', 'starting', 'up', 'down'] as const;
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
  /** Today in the user's time zone (`YYYY-MM-DD`): the days of the chart count back from it. */
  today: string;
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
