import { z } from 'zod';

/** Light, dark, or whatever the device is set to. */
export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Ready-made themes: an accent colour each; `violet` is the look the dashboard ships with. */
export const THEME_PRESETS = ['violet', 'blue', 'green', 'orange', 'pink', 'gray'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** The colour every other colour of a ready-made theme is derived from. */
export const THEME_PRESET_COLORS: Record<ThemePreset, string> = {
  violet: '#7d4ee8',
  blue: '#1d6fe0',
  green: '#1b8a4b',
  orange: '#d9730d',
  pink: '#d6409f',
  gray: '#6b7280',
};

/** `default` — Inter with Manrope headings; `system` — the font of the device itself. */
export const THEME_FONTS = ['default', 'system', 'serif', 'mono'] as const;
export type ThemeFont = (typeof THEME_FONTS)[number];

export const THEME_DENSITIES = ['normal', 'compact'] as const;
export type ThemeDensity = (typeof THEME_DENSITIES)[number];

/** Corners of cards, in pixels. */
export const THEME_RADIUS = { min: 0, max: 28, default: 20 } as const;

export const themeSchema = z.object({
  mode: z.enum(THEME_MODES),
  preset: z.enum(THEME_PRESETS),
  /** An accent of the user's own (`#rrggbb`); `null` — the colour of the preset. */
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable(),
  /** A pure black background in the dark mode — for OLED screens. */
  black: z.boolean(),
  font: z.enum(THEME_FONTS),
  density: z.enum(THEME_DENSITIES),
  radius: z.number().int().min(THEME_RADIUS.min).max(THEME_RADIUS.max),
  /** The soft glow of the accent colours behind the page. */
  glow: z.boolean(),
});
export type Theme = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: Theme = {
  mode: 'system',
  preset: 'violet',
  accent: null,
  black: false,
  font: 'default',
  density: 'normal',
  radius: THEME_RADIUS.default,
  glow: true,
};

/**
 * The theme of the account: what every device shows unless it has a theme of its own that is
 * newer. "Apply everywhere" saves the theme here with the current time, and so overrides them.
 */
export interface AccountTheme {
  theme: Theme;
  /** When it was applied everywhere (ISO). */
  everywhereAt: string;
}

/** A theme chosen on one device, kept by that device. */
export interface DeviceTheme {
  theme: Theme;
  /** When it was chosen (ISO). */
  savedAt: string;
}

/**
 * The theme a device shows: its own while that is newer than the account's, the account's
 * otherwise, the built-in one when neither is set.
 */
export function resolveTheme(device: DeviceTheme | null, account: AccountTheme | null): Theme {
  if (device && (!account || device.savedAt > account.everywhereAt)) {
    return device.theme;
  }
  return account?.theme ?? DEFAULT_THEME;
}
