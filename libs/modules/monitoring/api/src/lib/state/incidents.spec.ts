import { incidentsOf } from './incidents';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 7, 10, minute));
const checks = (pattern: string) =>
  [...pattern].map((mark, index) => ({ checkedAt: at(index * 5), isUp: mark === '+' }));

describe('incidentsOf', () => {
  it('finds the runs of failed checks and when each ended', () => {
    expect(incidentsOf(checks('++--+---+'))).toEqual([
      { from: at(10), to: at(20), failedChecks: 2 },
      { from: at(25), to: at(40), failedChecks: 3 },
    ]);
  });

  it('does not take a single failed check for an incident', () => {
    expect(incidentsOf(checks('+-+-+'))).toEqual([]);
  });

  it('leaves an incident open while the site is still down', () => {
    expect(incidentsOf(checks('+--'))).toEqual([{ from: at(5), to: null, failedChecks: 2 }]);
  });
});
