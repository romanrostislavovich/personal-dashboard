import { DEFAULT_THEME, Theme } from '@pd/contracts';
import { tokenName } from './theme-palette';
import { isDark, themeStyle } from './theme-style';

const palette = {
  light: { primary: '#111111', surface: '#ffffff' },
  dark: { primary: '#eeeeee', surface: '#121212' },
};
const theme = (changes: Partial<Theme>): Theme => ({ ...DEFAULT_THEME, ...changes });

describe('themeStyle', () => {
  it('leaves the built-in theme to the stylesheet', () => {
    const style = themeStyle(DEFAULT_THEME, null, false);
    expect(style.colorScheme).toBe('light dark');
    expect(style.variables['--pd-font']).toBeNull();
    expect(style.variables['--pd-radius']).toBe('20px');
    expect(style.variables['--pd-radius-small']).toBe('12px');
    expect(style.variables['--mat-sys-primary']).toBeUndefined();
    expect(style.classes).toEqual({ 'pd-compact': false, 'pd-no-glow': false });
  });

  it('sets the colours of an accent for both modes at once', () => {
    const style = themeStyle(theme({ preset: 'blue' }), palette, false);
    expect(style.variables['--mat-sys-primary']).toBe('light-dark(#111111, #eeeeee)');
  });

  it('paints the surfaces black only while the page is dark', () => {
    const black = theme({ black: true });
    expect(themeStyle(black, palette, true).variables['--mat-sys-surface']).toBe('#000000');
    expect(themeStyle(black, palette, false).variables['--mat-sys-surface']).toBe(
      'light-dark(#ffffff, #121212)',
    );
    expect(themeStyle(black, null, false).variables['--mat-sys-surface']).toBeUndefined();
  });

  it('turns the mode, the font, the density and the glow into the page settings', () => {
    const style = themeStyle(
      theme({ mode: 'dark', font: 'mono', density: 'compact', glow: false, radius: 0 }),
      null,
      true,
    );
    expect(style.colorScheme).toBe('dark');
    expect(style.variables['--pd-font']).toContain('monospace');
    expect(style.variables['--pd-radius']).toBe('0px');
    expect(style.classes).toEqual({ 'pd-compact': true, 'pd-no-glow': true });
  });
});

describe('isDark', () => {
  it('follows the device only in the system mode', () => {
    expect(isDark(theme({ mode: 'system' }), true)).toBe(true);
    expect(isDark(theme({ mode: 'light' }), true)).toBe(false);
    expect(isDark(theme({ mode: 'dark' }), false)).toBe(true);
  });
});

describe('tokenName', () => {
  it('names a Material role the way CSS does', () => {
    expect(tokenName('surfaceContainerLow')).toBe('surface-container-low');
    expect(tokenName('primary')).toBe('primary');
  });
});
