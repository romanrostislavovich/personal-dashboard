import { consentUntil } from './bank.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 18);

describe('consentUntil', () => {
  it('asks for 180 days when the bank gives as much or names no limit', () => {
    expect(consentUntil(null, NOW).getTime()).toBe(NOW + 180 * DAY);
    expect(consentUntil(365 * 86400, NOW).getTime()).toBe(NOW + 180 * DAY);
  });

  it('stays under a shorter limit of the bank', () => {
    const until = consentUntil(90 * 86400, NOW).getTime();
    expect(until).toBeLessThan(NOW + 90 * DAY);
    expect(until).toBeGreaterThan(NOW + 89 * DAY);
  });
});
