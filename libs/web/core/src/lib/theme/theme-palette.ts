/** A value per Material colour token (`primary`, `surface-container`…), for one of the two modes. */
export type Palette = Record<string, string>;

/** The colours of a theme in both modes. */
export interface ThemePalette {
  light: Palette;
  dark: Palette;
}

/**
 * The colour roles of Material 3, by the names of the library; in CSS they are
 * `--mat-sys-<kebab-case>` (see `mat.theme` in apps/web/src/styles.scss).
 */
const ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'primaryFixed',
  'primaryFixedDim',
  'onPrimaryFixed',
  'onPrimaryFixedVariant',
  'inversePrimary',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'secondaryFixed',
  'secondaryFixedDim',
  'onSecondaryFixed',
  'onSecondaryFixedVariant',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'tertiaryFixed',
  'tertiaryFixedDim',
  'onTertiaryFixed',
  'onTertiaryFixedVariant',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'background',
  'onBackground',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'surfaceTint',
  'inverseSurface',
  'inverseOnSurface',
  'outline',
  'outlineVariant',
] as const;

/** `surfaceContainerLow` → `surface-container-low` */
export function tokenName(role: string): string {
  return role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * The whole Material 3 palette grown from one colour, the way Material itself derives a theme
 * from an accent. The accent stays true to the colour that was picked (Material's "fidelity"
 * scheme; its default one would mute a vivid red into a dusty pink). `neutral` — a grey theme:
 * the accent stays close to grey. The library is loaded only when a palette is asked for: the
 * built-in theme needs none.
 */
export async function generatePalette(seed: string, neutral = false): Promise<ThemePalette> {
  const { argbFromHex, hexFromArgb, Hct, MaterialDynamicColors, SchemeFidelity, SchemeNeutral } =
    await import('@material/material-color-utilities');
  const source = Hct.fromInt(argbFromHex(seed));
  const palette = (dark: boolean): Palette => {
    const scheme = neutral
      ? new SchemeNeutral(source, dark, 0)
      : new SchemeFidelity(source, dark, 0);
    return Object.fromEntries(
      ROLES.map((role) => [
        tokenName(role),
        hexFromArgb(MaterialDynamicColors[role].getArgb(scheme)),
      ]),
    );
  };
  return { light: palette(false), dark: palette(true) };
}
