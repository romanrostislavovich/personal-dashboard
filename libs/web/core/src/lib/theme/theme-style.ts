import { Theme, ThemeFont } from '@pd/contracts';
import { ThemePalette } from './theme-palette';

/** What a theme does to `<html>`: variables and classes (see apps/web/src/styles.scss). */
export interface ThemeStyle {
  /** `color-scheme`: which of the two modes the colours resolve to. */
  colorScheme: string;
  /** CSS variables; a `null` value takes the variable off, back to the stylesheet's own. */
  variables: Record<string, string | null>;
  classes: { 'pd-compact': boolean; 'pd-no-glow': boolean };
}

const FONTS: Record<ThemeFont, { text: string; heading: string } | null> = {
  // The stylesheet's own Inter and Manrope.
  default: null,
  system: stack('system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'),
  serif: stack('Georgia, "Times New Roman", serif'),
  mono: stack('"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, monospace'),
};

function stack(family: string) {
  return { text: family, heading: family };
}

/** The surfaces of the dark mode on an OLED screen: black, a step lighter for each layer. */
const BLACK_SURFACES: Record<string, string> = {
  background: '#000000',
  surface: '#000000',
  'surface-dim': '#000000',
  'surface-container-lowest': '#000000',
  'surface-container-low': '#0a0a0c',
  'surface-container': '#101013',
  'surface-container-high': '#17171b',
  'surface-container-highest': '#1e1e23',
  'surface-bright': '#2a2a30',
};

/**
 * The style of a theme. `palette` — the colours of its accent (`null` for the built-in violet,
 * which the stylesheet already has); `dark` — whether the page is dark right now (the black
 * surfaces are set only then: `light-dark()` cannot keep a value it does not know).
 */
export function themeStyle(theme: Theme, palette: ThemePalette | null, dark: boolean): ThemeStyle {
  const variables: Record<string, string | null> = {};
  if (palette) {
    for (const token of Object.keys(palette.light)) {
      variables[`--mat-sys-${token}`] =
        `light-dark(${palette.light[token]}, ${palette.dark[token]})`;
    }
  }
  if (theme.black && dark) {
    for (const [token, color] of Object.entries(BLACK_SURFACES)) {
      variables[`--mat-sys-${token}`] = color;
    }
  }

  const font = FONTS[theme.font];
  variables['--pd-font'] = font?.text ?? null;
  variables['--pd-font-heading'] = font?.heading ?? null;
  variables['--pd-radius'] = `${theme.radius}px`;
  // Small parts (inputs, chips) keep the proportion of the built-in 20 / 12.
  variables['--pd-radius-small'] = `${Math.round(theme.radius * 0.6)}px`;

  return {
    colorScheme: theme.mode === 'system' ? 'light dark' : theme.mode,
    variables,
    classes: { 'pd-compact': theme.density === 'compact', 'pd-no-glow': !theme.glow },
  };
}

/** Whether the page is dark under the theme: its own mode, or the device's for `system`. */
export function isDark(theme: Theme, deviceIsDark: boolean): boolean {
  return theme.mode === 'system' ? deviceIsDark : theme.mode === 'dark';
}
