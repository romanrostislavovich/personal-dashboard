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
import {
  AmneziaVpnPlugin,
  PHONE_TUNNEL,
  phoneVpn,
  PhoneVpnStatus,
} from '@pd/web-core';
import {firstValueFrom} from 'rxjs';
import {VpnApi} from './vpn.api';
import {vpnErrorKey} from './vpn-errors';

/** Which VPN device this phone is: remembered here, in this app. */
const DEVICE_KEY = 'pd.vpn.thisPhone';
/** AmneziaWG takes a moment to bring the tunnel up or down before Android sees it. */
const SETTLE_MS = 2500;
const REFRESH_MS = 10_000;

/**
 * "This phone" — the VPN switched on and off from the dashboard's app through AmneziaWG. Android
 * asks once whether the dashboard may control AmneziaWG; AmneziaWG itself must allow remote
 * control. The kill switch here is Android's own setting: the card opens it and remembers.
 */
@Component({
  selector: 'pd-vpn-phone',
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
  templateUrl: './vpn-phone.component.html',
  styleUrl: './vpn-computer.component.scss',
})
export class VpnPhoneComponent {
  readonly devices = input.required<VpnDevice[]>();
  readonly changed = output<void>();

  private readonly api = inject(VpnApi);
  private plugin: AmneziaVpnPlugin | null = null;
  protected readonly shown = signal(false);
  protected readonly local = signal<PhoneVpnStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Switched on from here, and Android still sees no VPN: remote control is likely off. */
  protected readonly noAnswer = signal(false);
  protected readonly deviceId = signal<string | null>(readDevice());
  protected readonly device = computed(
    () => this.devices().find(device => device.id === this.deviceId()) ?? null,
  );
  protected readonly tunnel = PHONE_TUNNEL;

  constructor() {
    void phoneVpn().then(({plugin}) => {
      this.plugin = plugin;
      this.shown.set(plugin !== null);
      // The native side keeps it too: "turn the VPN on on the phone" arrives as a push.
      const id = this.deviceId();
      if (id) {
        void plugin?.setDevice?.({id});
      }
      void this.refresh();
    });
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected choose(id: string): void {
    this.deviceId.set(id);
    void this.plugin?.setDevice?.({id});
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      // Storage is a convenience: without it the choice lasts until the page closes.
    }
  }

  protected async allow(): Promise<void> {
    await this.plugin?.requestControl();
    // Android's question is a dialog of its own: its answer shows on the next look.
    setTimeout(() => void this.refresh(), 1500);
  }

  protected async toggle(up: boolean): Promise<void> {
    if (!this.plugin || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.noAnswer.set(false);
    try {
      await this.plugin.setTunnel({up, tunnel: PHONE_TUNNEL});
      await new Promise(resolve => setTimeout(resolve, SETTLE_MS));
      await this.refresh();
      this.noAnswer.set(this.local()?.vpnActive !== up);
    } finally {
      this.busy.set(false);
    }
  }

  protected async killSwitch(on: boolean): Promise<void> {
    const device = this.device();
    if (!device) {
      return;
    }
    this.error.set(null);
    try {
      await firstValueFrom(this.api.updateDevice(device.id, {killSwitch: on}));
      this.changed.emit();
      if (on) {
        await this.plugin?.openVpnSettings();
      }
    } catch (error) {
      this.error.set(vpnErrorKey(error));
    }
  }

  protected openSettings(): void {
    void this.plugin?.openVpnSettings();
  }

  protected openAmneziaSettings(): void {
    void this.plugin?.openAmneziaSettings?.();
  }

  protected openAmnezia(): void {
    void this.plugin?.openAmnezia();
  }

  private async refresh(): Promise<void> {
    if (this.plugin) {
      this.local.set(await this.plugin.status());
    }
  }
}

function readDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}
