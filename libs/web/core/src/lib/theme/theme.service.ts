import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  AccountTheme,
  DeviceTheme,
  resolveTheme,
  Theme,
  THEME_PRESET_COLORS,
  themeSchema,
} from '@pd/contracts';
import { AuthService } from '../auth/auth.service';
import { generatePalette, ThemePalette } from './theme-palette';
import { isDark, themeStyle } from './theme-style';

/** The theme chosen on this device. */
const DEVICE_KEY = 'pd.theme';
/** The theme of the account as last seen: the page starts with it, before the session is back. */
const ACCOUNT_KEY = 'pd.theme.account';
/** The last generated palette: the next start paints with it at once, without the library. */
const PALETTE_KEY = 'pd.theme.palette';

interface KeptPalette {
  /** The accent it was grown from (see `paletteKey`). */
  key: string;
  palette: ThemePalette;
}

/**
 * The look of the dashboard: mode, accent, font, density, corners, glow.
 *
 * A device shows its own theme (kept in its `localStorage`) while that is newer than the
 * account's; "apply everywhere" saves the theme to the account, which every device then follows
 * (`resolveTheme` in contracts). The theme is applied by setting variables and classes on
 * `<html>` over the built-in look of apps/web/src/styles.scss.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthService);
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly window = inject(DOCUMENT).defaultView;

  private readonly device = signal<DeviceTheme | null>(readDevice());
  private readonly deviceIsDark = signal(false);
  private readonly kept = signal<KeptPalette | null>(readJson<KeptPalette>(PALETTE_KEY));
  /** Variables this service has set — to take them off when a theme no longer sets them. */
  private applied = new Set<string>();

  private readonly lastAccount = signal<AccountTheme | null>(readJson<AccountTheme>(ACCOUNT_KEY));

  /**
   * The theme of the account; `null` — never applied everywhere. Until the session is restored
   * (and on the sign-in page) it is the one this device saw last.
   */
  readonly account = computed(() => {
    const user = this.auth.user();
    return user ? user.theme : this.lastAccount();
  });
  /** What this device shows. */
  readonly theme = computed(() => resolveTheme(this.device(), this.account()));
  /** This device shows a theme of its own, not the account's. */
  readonly isOwn = computed(() => this.device() !== null && this.theme() === this.device()?.theme);

  constructor() {
    const media = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
    if (media) {
      this.deviceIsDark.set(media.matches);
      media.addEventListener('change', (event) => this.deviceIsDark.set(event.matches));
    }

    effect(() => {
      const user = this.auth.user();
      if (user) {
        writeJson(ACCOUNT_KEY, user.theme);
      }
    });

    // Grows the palette of the accent when the theme asks for one that is not at hand.
    effect(() => {
      const key = paletteKey(this.theme());
      if (key && this.kept()?.key !== key) {
        const [seed, neutral] = key.split('|');
        void generatePalette(seed, neutral === 'neutral').then((palette) => {
          this.kept.set({ key, palette });
          writeJson(PALETTE_KEY, { key, palette });
        });
      }
    });

    effect(() => {
      const theme = this.theme();
      const key = paletteKey(theme);
      const kept = this.kept();
      // Until the palette is grown the page keeps the colours it has.
      const palette = key && kept?.key === key ? kept.palette : null;
      this.apply(theme, palette, isDark(theme, this.deviceIsDark()));
    });
  }

  /** Changes the theme of this device; other devices are not touched. */
  update(changes: Partial<Theme>): void {
    const device = { theme: { ...this.theme(), ...changes }, savedAt: new Date().toISOString() };
    this.device.set(device);
    writeJson(DEVICE_KEY, device);
  }

  /** Makes the theme of this device the theme of the account: every device takes it. */
  async applyEverywhere(): Promise<void> {
    await this.auth.updateProfile({ theme: this.theme() });
    this.forgetDevice();
  }

  /** Back to the theme of the account. */
  useAccountTheme(): void {
    this.forgetDevice();
  }

  private forgetDevice(): void {
    this.device.set(null);
    try {
      this.window?.localStorage.removeItem(DEVICE_KEY);
    } catch {
      // Storage is off (private mode): there was nothing kept.
    }
  }

  private apply(theme: Theme, palette: ThemePalette | null, dark: boolean): void {
    const style = themeStyle(theme, palette, dark);
    const set = new Set<string>();
    this.root.style.setProperty('color-scheme', style.colorScheme);
    for (const [name, value] of Object.entries(style.variables)) {
      if (value === null) {
        this.root.style.removeProperty(name);
      } else {
        this.root.style.setProperty(name, value);
        set.add(name);
      }
    }
    for (const name of this.applied) {
      if (!set.has(name)) {
        this.root.style.removeProperty(name);
      }
    }
    this.applied = set;
    for (const [name, on] of Object.entries(style.classes)) {
      this.root.classList.toggle(name, on);
    }
  }
}

/**
 * What the palette of a theme is grown from: `<colour>|<neutral or true>`; `null` — the
 * built-in violet, whose colours the stylesheet already has.
 */
export function paletteKey(theme: Theme): string | null {
  if (theme.accent) {
    return `${theme.accent.toLowerCase()}|true`;
  }
  if (theme.preset === 'violet') {
    return null;
  }
  return `${THEME_PRESET_COLORS[theme.preset]}|${theme.preset === 'gray' ? 'neutral' : 'true'}`;
}

/** The theme kept by this device; what does not fit the current schema is dropped. */
function readDevice(): DeviceTheme | null {
  const kept = readJson<DeviceTheme>(DEVICE_KEY);
  const theme = themeSchema.safeParse(kept?.theme);
  return kept && theme.success && typeof kept.savedAt === 'string'
    ? { theme: theme.data, savedAt: kept.savedAt }
    : null;
}

function readJson<T>(key: string): T | null {
  try {
    const text = globalThis.localStorage?.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is off or full: the theme lives until the page is closed.
  }
}
