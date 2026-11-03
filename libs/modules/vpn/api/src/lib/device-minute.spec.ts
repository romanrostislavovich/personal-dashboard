import {deviceMinute} from './device-minute';

const now = new Date('2026-11-03T12:00:00Z');
const at = (secondsAgo: number) =>
  Math.floor(now.getTime() / 1000) - secondsAgo;
const peer = (rx: number, tx: number, handshake = at(30)) => ({
  publicKey: 'K',
  endpoint: '93.84.1.2:5000',
  latestHandshake: handshake,
  rx,
  tx,
});

describe('deviceMinute', () => {
  it('a first look: the first connection, its bytes and a minute pending', () => {
    const minute = deviceMinute(undefined, peer(100, 900), '2026-11-03', now);
    expect(minute).toMatchObject({
      first: true,
      online: true,
      address: '93.84.1.2',
    });
    expect(minute.next).toMatchObject({
      pendingDay: '2026-11-03',
      pendingRx: 100,
      pendingTx: 900,
      pendingMinutes: 1,
      seenRx: 100,
    });
  });

  it('adds the difference, and starts anew on another day or after a restart', () => {
    const one = deviceMinute(undefined, peer(100, 900), '2026-11-03', now).next;
    const two = deviceMinute(one, peer(150, 1000), '2026-11-03', now);
    expect(two.first).toBe(false);
    expect(two.next).toMatchObject({
      pendingRx: 150,
      pendingTx: 1000,
      pendingMinutes: 2,
    });
    const restarted = deviceMinute(two.next, peer(20, 30), '2026-11-04', now);
    expect(restarted.next).toMatchObject({
      pendingDay: '2026-11-04',
      pendingRx: 20,
      pendingTx: 30,
      pendingMinutes: 1,
    });
  });

  it('an old handshake is not a minute online; never connected keeps it unknown', () => {
    expect(
      deviceMinute(undefined, peer(0, 0, at(600)), '2026-11-03', now).online,
    ).toBe(false);
    const never = deviceMinute(
      undefined,
      {...peer(0, 0, 0), endpoint: null},
      '2026-11-03',
      now,
    );
    expect(never).toMatchObject({first: false, online: false, address: null});
    expect(never.next.firstConnectedAt).toBeNull();
  });

  it('tells when a connected device goes off, once', () => {
    const on = deviceMinute(undefined, peer(1, 1), '2026-11-03', now);
    expect(on.wentOff).toBe(false);
    const off = deviceMinute(on.next, peer(1, 1, at(600)), '2026-11-03', now);
    expect(off.wentOff).toBe(true);
    expect(
      deviceMinute(off.next, peer(1, 1, at(660)), '2026-11-03', now).wentOff,
    ).toBe(false);
  });
});
