import {readingMilliseconds, scrollDepth} from './engagement';

describe('active reading aggregates', () => {
  it('counts only the active portion of a visible focused interval', () => {
    expect(readingMilliseconds(1000, 6000, 3000, true, true)).toBe(3000);
    expect(readingMilliseconds(59_000, 64_000, 1000, true, true)).toBe(2000);
    expect(readingMilliseconds(1000, 6000, -Infinity, true, true)).toBe(0);
    expect(readingMilliseconds(1000, 6000, 1000, false, true)).toBe(0);
    expect(readingMilliseconds(1000, 6000, 1000, true, false)).toBe(0);
    expect(readingMilliseconds(0, 300_000, 0, true, true)).toBe(0);
    expect(readingMilliseconds(1000, 500, 0, true, true)).toBe(0);
  });

  it('bounds scroll depth, including short pages and invalid geometry', () => {
    expect(scrollDepth(500, 2000, 500)).toBe(50);
    expect(scrollDepth(0, 100, 500)).toBe(100);
    expect(scrollDepth(-200, 1000, 500)).toBe(50);
    expect(scrollDepth(Infinity, 1000, 500)).toBe(0);
    expect(scrollDepth(0, 0, 500)).toBe(0);
  });
});
