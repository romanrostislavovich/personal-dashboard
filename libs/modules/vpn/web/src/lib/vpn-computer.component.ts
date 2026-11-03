import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {TranslocoPipe} from '@jsverse/transloco';
import {VpnDevice} from '@pd/contracts';
import {desktopBridge, DesktopVpnResult, DesktopVpnStatus} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {VpnApi} from './vpn.api';
import {vpnErrorKey} from './vpn-errors';

/** Which VPN device this computer is: remembered here, in this app. */
const DEVICE_KEY = 'pd.vpn.thisComputer';
/** The tunnel's state as Windows sees it: looked at again this often. */
const REFRESH_MS = 10_000;

/**
 * "This computer" — the VPN switched on and off from the desktop app, through AmneziaWG (see
 * apps/desktop/src/vpn): set up once with the administrator's consent, then a toggle. The second
 * toggle is the kill switch: with it the internet is off while the VPN is down.
 */
@Component({
  selector: 'pd-vpn-computer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  templateUrl: './vpn-computer.component.html',
  styleUrl: './vpn-computer.component.scss',
})
export class VpnComputerComponent {
  readonly devices = input.required<VpnDevice[]>();
  /** A device changed (its kill switch): the page reloads. */
  readonly changed = output<void>();

  private readonly bridge = desktopBridge()?.vpn ?? null;
  private readonly api = inject(VpnApi);
  protected readonly local = signal<DesktopVpnStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deviceId = signal<string | null>(readDevice());

  protected readonly shown = this.bridge !== null;
  protected readonly device = computed(
    () => this.devices().find(device => device.id === this.deviceId()) ?? null,
  );
  protected readonly running = computed(() => this.local()?.running !== null);

  constructor() {
    if (!this.bridge) {
      return;
    }
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected choose(id: string): void {
    this.deviceId.set(id);
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      // Storage is a convenience: without it the choice lasts until the page closes.
    }
  }

  /** Once, as administrator: this device's config becomes the computer's tunnels. */
  protected setup(): Promise<void> {
    return this.act(async bridge => {
      const device = this.device();
      if (!device) {
        return {ok: false};
      }
      const {config} = await firstValueFrom(this.api.config(device.id));
      return bridge.setup(config);
    });
  }

  protected toggle(on: boolean): Promise<void> {
    return this.act(bridge =>
      on ? bridge.start(this.device()?.killSwitch ?? true) : bridge.stop(),
    );
  }

  /** Saved on the device; a running tunnel is switched to the other kind at once. */
  protected killSwitch(on: boolean): Promise<void> {
    return this.act(async bridge => {
      const device = this.device();
      if (!device) {
        return {ok: false};
      }
      await firstValueFrom(this.api.updateDevice(device.id, {killSwitch: on}));
      this.changed.emit();
      return this.running() ? bridge.start(on) : {ok: true};
    });
  }

  protected remove(): Promise<void> {
    return this.act(bridge => bridge.remove());
  }

  private async act(
    step: (
      bridge: NonNullable<typeof this.bridge>,
    ) => Promise<DesktopVpnResult>,
  ): Promise<void> {
    if (!this.bridge || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await step(this.bridge);
      if (result.canceled) {
        this.error.set('vpn.computer.canceled');
      } else if (!result.ok) {
        this.error.set('vpn.computer.failed');
      }
    } catch (error) {
      this.error.set(vpnErrorKey(error));
    } finally {
      this.busy.set(false);
      await this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    this.local.set((await this.bridge?.status()) ?? null);
  }
}

function readDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}
