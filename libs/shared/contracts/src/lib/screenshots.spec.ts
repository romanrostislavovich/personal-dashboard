import {
  nextFreeName,
  screenshotName,
  screenshotNameSchema,
} from './screenshots';

describe('screenshots', () => {
  it('names a screenshot by its moment, a folder a month', () => {
    expect(screenshotName(new Date(2026, 9, 6, 8, 4, 5))).toBe(
      '2026-10/2026-10-06 08-04-05.png',
    );
  });

  it('takes a path inside the folder only, of a picture', () => {
    expect(screenshotNameSchema.safeParse('2026-10/shot.png').success).toBe(
      true,
    );
    expect(screenshotNameSchema.safeParse('../secret.png').success).toBe(false);
    expect(screenshotNameSchema.safeParse('2026-10//shot.png').success).toBe(
      false,
    );
    expect(screenshotNameSchema.safeParse('C:/shot.png').success).toBe(false);
    expect(screenshotNameSchema.safeParse('notes.txt').success).toBe(false);
  });

  it('finds a free name next to a taken one', () => {
    const taken = new Set(['a/shot.png', 'a/shot (2).png']);
    expect(nextFreeName('a/shot.png', name => taken.has(name))).toBe(
      'a/shot (3).png',
    );
    expect(nextFreeName('a/free.png', name => taken.has(name))).toBe(
      'a/free.png',
    );
  });
});
