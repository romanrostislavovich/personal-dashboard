import { isDigestDue } from './digest-schedule';

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
