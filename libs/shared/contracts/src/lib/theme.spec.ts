import { DEFAULT_THEME, resolveTheme, Theme, themeSchema } from './theme';

const dark: Theme = { ...DEFAULT_THEME, mode: 'dark' };
const green: Theme = { ...DEFAULT_THEME, preset: 'green' };

describe('resolveTheme', () => {
  it('is the built-in theme until something is chosen', () => {
    expect(resolveTheme(null, null)).toEqual(DEFAULT_THEME);
  });

  it('shows the theme of the account on a device without its own', () => {
    expect(resolveTheme(null, { theme: green, everywhereAt: '2026-10-02T10:00:00.000Z' })).toBe(
      green,
    );
  });

  it('keeps the device its own theme while that is the newer one', () => {
    const account = { theme: green, everywhereAt: '2026-10-02T10:00:00.000Z' };
    expect(resolveTheme({ theme: dark, savedAt: '2026-10-02T11:00:00.000Z' }, account)).toBe(dark);
    expect(resolveTheme({ theme: dark, savedAt: '2026-10-02T11:00:00.000Z' }, null)).toBe(dark);
  });

  it('lets "apply everywhere" override a device that chose earlier', () => {
    const account = { theme: green, everywhereAt: '2026-10-02T12:00:00.000Z' };
    expect(resolveTheme({ theme: dark, savedAt: '2026-10-02T11:00:00.000Z' }, account)).toBe(green);
  });
});

describe('themeSchema', () => {
  it('takes the built-in theme and an accent of the user', () => {
    expect(themeSchema.parse(DEFAULT_THEME)).toEqual(DEFAULT_THEME);
    expect(themeSchema.safeParse({ ...DEFAULT_THEME, accent: '#12abEF' }).success).toBe(true);
  });

  it('refuses what is not a colour or is out of range', () => {
    expect(themeSchema.safeParse({ ...DEFAULT_THEME, accent: 'red' }).success).toBe(false);
    expect(themeSchema.safeParse({ ...DEFAULT_THEME, radius: 99 }).success).toBe(false);
  });
});
