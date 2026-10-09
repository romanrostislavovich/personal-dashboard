import { newTroubles, stateOf } from './integration-state';

const now = new Date('2026-10-09T12:00:00Z');
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
const report = (changes: object) => ({ name: 'GitHub', lastSyncedAt: ago(1), ...changes });

describe('stateOf', () => {
  it('is fine after a fresh refresh without an error', () => {
    expect(stateOf(report({}), 48, now)).toBe('ok');
  });

  it('tells an error, a late refresh and a token about to expire', () => {
    expect(stateOf(report({ error: 'Bad credentials' }), 48, now)).toBe('error');
    expect(stateOf(report({ lastSyncedAt: ago(72) }), 48, now)).toBe('stale');
    expect(stateOf(report({ expiresAt: inDays(5) }), 48, now)).toBe('expiring');
    expect(stateOf(report({ expiresAt: inDays(40) }), 48, now)).toBe('ok');
  });

  it('puts the worst first: an expired token explains the error it causes', () => {
    expect(stateOf(report({ expiresAt: inDays(-1), error: '401' }), 48, now)).toBe('expired');
    expect(stateOf(report({ error: '500', lastSyncedAt: ago(100) }), 48, now)).toBe('error');
  });

  it('does not call stale what never refreshed or does not refresh by itself', () => {
    expect(stateOf({ name: 'Telegram' }, 48, now)).toBe('ok');
    expect(stateOf({ name: 'Last.fm', lastSyncedAt: null }, 48, now)).toBe('ok');
  });
});

describe('newTroubles', () => {
  it('tells a trouble once, and again when it changes or comes back', () => {
    const statuses = [
      { id: 'a', state: 'error' as const },
      { id: 'b', state: 'expiring' as const },
      { id: 'c', state: 'ok' as const },
    ];
    const told = new Map([
      ['a', 'error' as const],
      ['b', 'stale' as const],
      ['c', 'error' as const],
      ['gone', 'error' as const],
    ]);
    expect(newTroubles(statuses, told)).toEqual({ tell: ['b'], forget: ['c', 'gone'] });
  });
});
