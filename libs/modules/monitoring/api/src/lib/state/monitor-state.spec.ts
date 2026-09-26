import { applyCheck, isSslReminderDay, MonitorState } from './monitor-state';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 26, 12, minute));
const up: MonitorState = { status: 'up', consecutiveFailures: 0, failingSince: null };

describe('applyCheck', () => {
  it('turns a new monitor up without an event', () => {
    const pending: MonitorState = { ...up, status: 'pending' };
    expect(applyCheck(pending, true, at(0))).toEqual({ state: up, event: null });
  });

  it('does not go down after a single failure', () => {
    const { state, event } = applyCheck(up, false, at(0));
    expect(state).toEqual({ status: 'up', consecutiveFailures: 1, failingSince: at(0) });
    expect(event).toBeNull();
  });

  it('goes down after two failures in a row, dated by the first failure', () => {
    const first = applyCheck(up, false, at(0)).state;
    const { state, event } = applyCheck(first, false, at(5));
    expect(state.status).toBe('down');
    expect(event).toEqual({ type: 'down', since: at(0) });
  });

  it('does not repeat the down event while still down', () => {
    const down: MonitorState = { status: 'down', consecutiveFailures: 2, failingSince: at(0) };
    expect(applyCheck(down, false, at(10)).event).toBeNull();
  });

  it('reports recovery with the downtime', () => {
    const down: MonitorState = { status: 'down', consecutiveFailures: 3, failingSince: at(0) };
    const { state, event } = applyCheck(down, true, at(15));
    expect(state).toEqual(up);
    expect(event).toEqual({ type: 'recovered', downtimeMs: 15 * 60 * 1000 });
  });

  it('silently resets after a single glitch', () => {
    const glitch = applyCheck(up, false, at(0)).state;
    expect(applyCheck(glitch, true, at(5))).toEqual({ state: up, event: null });
  });
});

describe('isSslReminderDay', () => {
  it('reminds on the scheduled days and after expiry', () => {
    expect([30, 14, 10, 7, 3, 2, 1, 0, -5].map(isSslReminderDay)).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
      true,
      true,
    ]);
  });
});
