import { goalStatus, yearShare } from './goal-status';

describe('goalStatus', () => {
  const total = { year: 2026, target: 300, direction: 'atLeast' as const };

  it('expects a total to grow evenly over the year', () => {
    // 2 July 2026 is the end of the 183rd day of 365.
    const { expected, status } = goalStatus(total, 160, false, '2026-07-02');
    expect(expected).toBeCloseTo(150.4, 0);
    expect(status).toBe('onTrack');
    expect(goalStatus(total, 100, false, '2026-07-02').status).toBe('behind');
  });

  it('is done once reached and failed when the year ended short', () => {
    expect(goalStatus(total, 300, false, '2026-10-01').status).toBe('done');
    expect(goalStatus(total, 299, false, '2027-01-01').status).toBe('failed');
  });

  it('settles an average only at the end of the year', () => {
    const mood = { year: 2026, target: 4, direction: 'atLeast' as const };
    expect(goalStatus(mood, 4.2, true, '2026-07-02')).toEqual({ expected: 4, status: 'onTrack' });
    expect(goalStatus(mood, 3.5, true, '2026-07-02').status).toBe('behind');
    expect(goalStatus(mood, 4.2, true, '2027-01-02').status).toBe('done');
  });

  it('fails a limit as soon as it is crossed', () => {
    const limit = { year: 2026, target: 1000, direction: 'atMost' as const };
    expect(goalStatus(limit, 400, false, '2026-07-02').status).toBe('onTrack');
    expect(goalStatus(limit, 700, false, '2026-07-02').status).toBe('behind');
    expect(goalStatus(limit, 1001, false, '2026-07-02').status).toBe('failed');
    expect(goalStatus(limit, 990, false, '2027-01-01').status).toBe('done');
  });
});

describe('yearShare', () => {
  it('is 0 before the year and 1 after it', () => {
    expect(yearShare(2026, '2025-12-31')).toBe(0);
    expect(yearShare(2026, '2026-12-31')).toBe(1);
    expect(yearShare(2026, '2027-03-01')).toBe(1);
  });
});
