import {
  counterDelta,
  endpointAddress,
  ONLINE_HANDSHAKE_SECONDS,
  PeerStatus,
} from './awg-config';

/** What is kept of a device between the container's looks (the unsynced `vpn.device_state`). */
export interface DeviceState {
  firstConnectedAt: Date | null;
  lastHandshakeAt: Date | null;
  lastAddress: string | null;
  online: boolean;
  seenRx: number;
  seenTx: number;
  pendingDay: string | null;
  pendingRx: number;
  pendingTx: number;
  pendingMinutes: number;
}

export interface DeviceMinute {
  /** The state to save. */
  next: DeviceState;
  online: boolean;
  /** The address it came from, without the port. */
  address: string | null;
  /** Its very first handshake is in this look. */
  first: boolean;
  /** It was connected at the last look and is not now: the VPN went off on it. */
  wentOff: boolean;
}

const EMPTY: DeviceState = {
  firstConnectedAt: null,
  lastHandshakeAt: null,
  lastAddress: null,
  online: false,
  seenRx: 0,
  seenTx: 0,
  pendingDay: null,
  pendingRx: 0,
  pendingTx: 0,
  pendingMinutes: 0,
};

/**
 * One look of the container at a device: the bytes since the last look and, when connected, a
 * minute, added to what is pending for `today`. A pending of another day must be flushed first
 * (the caller does it): here it is started anew.
 */
export function deviceMinute(
  saved: DeviceState | undefined,
  peer: PeerStatus,
  today: string,
  now: Date,
): DeviceMinute {
  const state = saved ?? EMPTY;
  const sameDay = state.pendingDay === today;
  const handshakeAt = peer.latestHandshake
    ? new Date(peer.latestHandshake * 1000)
    : null;
  const online =
    handshakeAt !== null &&
    now.getTime() - handshakeAt.getTime() < ONLINE_HANDSHAKE_SECONDS * 1000;
  const address = peer.endpoint ? endpointAddress(peer.endpoint) : null;
  return {
    online,
    address,
    first: !state.firstConnectedAt && handshakeAt !== null,
    wentOff: state.online && !online,
    next: {
      online,
      firstConnectedAt: state.firstConnectedAt ?? handshakeAt,
      lastHandshakeAt: handshakeAt ?? state.lastHandshakeAt,
      lastAddress: address ?? state.lastAddress,
      seenRx: peer.rx,
      seenTx: peer.tx,
      pendingDay: today,
      pendingRx:
        (sameDay ? state.pendingRx : 0) + counterDelta(peer.rx, state.seenRx),
      pendingTx:
        (sameDay ? state.pendingTx : 0) + counterDelta(peer.tx, state.seenTx),
      pendingMinutes: (sameDay ? state.pendingMinutes : 0) + (online ? 1 : 0),
    },
  };
}
