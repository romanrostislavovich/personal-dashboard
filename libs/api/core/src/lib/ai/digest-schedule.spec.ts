import { clockIn, isDigestDue } from './digest-schedule';

describe('isDigestDue', () => {
  const today = '2026-10-02';

  it('waits for the chosen time', () => {
    expect(isDigestDue({ time: '07:15', lastDay: '2026-10-01' }, today, '07:10')).toBe(false);
    expect(isDigestDue({ time: '07:15', lastDay: '2026-10-01' }, today, '07:15')).toBe(true);
  });

  it('sends a digest missed while the server was off', () => {
    expect(isDigestDue({ time: '07:15', lastDay: '2026-10-01' }, today, '11:40')).toBe(true);
  });

  it('does not send twice a day, even if the time is moved later', () => {
    expect(isDigestDue({ time: '21:00', lastDay: today }, today, '21:05')).toBe(false);
  });

  it('sends the first digest of a user who never got one', () => {
    expect(isDigestDue({ time: '08:30', lastDay: null }, today, '08:30')).toBe(true);
  });
});

describe('clockIn', () => {
  it('reads the clock of the time zone', () => {
    const at = new Date('2026-10-02T05:07:00Z');
    expect(clockIn('Europe/Warsaw', at)).toBe('07:07');
    expect(clockIn('UTC', at)).toBe('05:07');
  });

  it('writes midnight as 00, not 24', () => {
    expect(clockIn('UTC', new Date('2026-10-02T00:03:00Z'))).toBe('00:03');
  });
});
