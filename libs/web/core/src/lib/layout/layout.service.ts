import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AccountLayout, DeviceLayout, Layout, layoutSchema, resolveLayout } from '@pd/contracts';
import { AuthService } from '../auth/auth.service';

/** The layout chosen on this device. */
const DEVICE_KEY = 'pd.layout';
/** The layout of the account as last seen: the menu starts with it, before the session is back. */
const ACCOUNT_KEY = 'pd.layout.account';

/**
 * Which sections are in the menu and how the home page is arranged. Kept the way themes are
 * (see ThemeService): a device shows its own layout while that is newer than the account's;
 * "apply everywhere" saves it to the account, which every device then follows.
 */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly auth = inject(AuthService);

  private readonly device = signal<DeviceLayout | null>(readDevice());
  private readonly lastAccount = signal<AccountLayout | null>(readJson<AccountLayout>(ACCOUNT_KEY));

  /** The layout of the account; until the session is restored — the one this device saw last. */
  readonly account = computed(() => {
    const user = this.auth.user();
    return user ? user.layout : this.lastAccount();
  });
  /** What this device shows. */
  readonly layout = computed(() => resolveLayout(this.device(), this.account()));
  /** This device shows a layout of its own, not the account's. */
  readonly isOwn = computed(
    () => this.device() !== null && this.layout() === this.device()?.layout,
  );
  private readonly hidden = computed(() => new Set(this.layout().hiddenSections));

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user) {
        writeJson(ACCOUNT_KEY, user.layout);
      }
    });
  }

  /** A section left out of the menu and the home page; its pages still open by their address. */
  isHidden(section: string): boolean {
    return this.hidden().has(section);
  }

  /** Changes the layout of this device; other devices are not touched. */
  update(changes: Partial<Layout>): void {
    const device = { layout: { ...this.layout(), ...changes }, savedAt: new Date().toISOString() };
    this.device.set(device);
    writeJson(DEVICE_KEY, device);
  }

  setHidden(section: string, hidden: boolean): void {
    const others = this.layout().hiddenSections.filter((id) => id !== section);
    this.update({ hiddenSections: hidden ? [...others, section] : others });
  }

  /** Makes the layout of this device the layout of the account: every device takes it. */
  async applyEverywhere(): Promise<void> {
    await this.auth.updateProfile({ layout: this.layout() });
    this.useAccountLayout();
  }

  /** Back to the layout of the account. */
  useAccountLayout(): void {
    this.device.set(null);
    try {
      globalThis.localStorage?.removeItem(DEVICE_KEY);
    } catch {
      // Storage is off (private mode): there was nothing kept.
    }
  }
}

/** The layout kept by this device; what does not fit the current schema is dropped. */
function readDevice(): DeviceLayout | null {
  const kept = readJson<DeviceLayout>(DEVICE_KEY);
  const layout = layoutSchema.safeParse(kept?.layout);
  return kept && layout.success && typeof kept.savedAt === 'string'
    ? { layout: layout.data, savedAt: kept.savedAt }
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
    // Storage is off or full: the layout lives until the page is closed.
  }
}
