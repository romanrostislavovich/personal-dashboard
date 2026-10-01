import { isValidTimeZone, zonedDateTime, zonedToUtc } from './time-zone';

describe('zonedDateTime', () => {
  it('shows the clock of the zone', () => {
    const at = new Date('2026-10-02T21:30:00Z');
    expect(zonedDateTime(at, 'Europe/Warsaw')).toEqual({ date: '2026-10-02', time: '23:30' });
    expect(zonedDateTime(at, 'Asia/Tokyo')).toEqual({ date: '2026-10-03', time: '06:30' });
    expect(zonedDateTime(at, 'America/New_York')).toEqual({ date: '2026-10-02', time: '17:30' });
  });

  it('writes midnight as 00:00', () => {
    expect(zonedDateTime(new Date('2026-10-02T22:00:00Z'), 'Europe/Warsaw').time).toBe('00:00');
  });
});

describe('zonedToUtc', () => {
  it('turns a wall clock time into the moment, in summer and in winter', () => {
    // Warsaw is UTC+2 in summer and UTC+1 in winter.
    expect(zonedToUtc({ date: '2026-07-15', time: '09:00' }, 'Europe/Warsaw').toISOString()).toBe(
      '2026-07-15T07:00:00.000Z',
    );
    expect(zonedToUtc({ date: '2026-12-15', time: '09:00' }, 'Europe/Warsaw').toISOString()).toBe(
      '2026-12-15T08:00:00.000Z',
    );
  });

  it('is the reverse of zonedDateTime', () => {
    for (const timeZone of ['Europe/Warsaw', 'Asia/Kolkata', 'America/Los_Angeles', 'UTC']) {
      const local = { date: '2026-03-10', time: '18:45' };
      expect(zonedDateTime(zonedToUtc(local, timeZone), timeZone)).toEqual(local);
    }
  });

  it('stays right on the day the clocks change', () => {
    // 25 October 2026: Warsaw goes back from UTC+2 to UTC+1 at 03:00.
    expect(zonedToUtc({ date: '2026-10-25', time: '12:00' }, 'Europe/Warsaw').toISOString()).toBe(
      '2026-10-25T11:00:00.000Z',
    );
    expect(zonedToUtc({ date: '2026-10-24', time: '12:00' }, 'Europe/Warsaw').toISOString()).toBe(
      '2026-10-24T10:00:00.000Z',
    );
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone('Europe/Warsaw')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
