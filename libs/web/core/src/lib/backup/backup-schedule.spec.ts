import {copyDue, copyName} from './backup-schedule';

describe('the copies on a device', () => {
  const now = new Date(2026, 9, 14, 9, 30);

  it('makes the first copy at once, then one a day', () => {
    expect(copyDue(undefined, now)).toBe(true);
    expect(
      copyDue({savedAt: new Date(2026, 9, 13, 20, 0).toISOString()}, now),
    ).toBe(false);
    expect(
      copyDue({savedAt: new Date(2026, 9, 13, 9, 30).toISOString()}, now),
    ).toBe(true);
  });

  it('names a copy by the day on the device', () => {
    expect(copyName(new Date(2026, 0, 5, 23, 59))).toBe(
      'personal-dashboard-2026-01-05.zip',
    );
  });
});
