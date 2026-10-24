import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { App } from '@capacitor/app';
import { activityApi } from '@pd/client-core';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { mobileServer, phoneModel } from '../mobile/mobile-app';
import { phoneSensors, PhoneSensorsStatus } from '../mobile/phone-sensors';

type Step = 'usageAccess' | 'notificationAccess' | 'unrestricted';

/**
 * Settings → Apps inside the Android app: the phone as a sensor. Switching it on makes the phone
 * a device of the Activity section (its time in apps there, its notifications in Activity →
 * Notifications); then each permission Android asks for has a button to its settings screen,
 * and MIUI's autostart one too. The checks are read again when the user comes back.
 */
@Component({
  selector: 'pd-phone-sensors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    @if (available()) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>sensors</mat-icon>
          <mat-card-title>{{ 'core.settings.phone.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'core.settings.phone.hint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content class="content">
          @if (status(); as s) {
            @if (!s.configured) {
              <button matButton="filled" [disabled]="busy()" (click)="enable()">
                {{ 'core.settings.phone.enable' | transloco }}
              </button>
            } @else {
              @for (step of steps; track step) {
                <div class="step">
                  <mat-icon [class.ok]="s[step]">
                    {{ s[step] ? 'check_circle' : 'radio_button_unchecked' }}
                  </mat-icon>
                  <span>{{ 'core.settings.phone.steps.' + step | transloco }}</span>
                  @if (!s[step]) {
                    <button matButton="tonal" (click)="open(step)">
                      {{ 'core.settings.phone.allow' | transloco }}
                    </button>
                  }
                </div>
              }
              <div class="step">
                <mat-icon>rocket_launch</mat-icon>
                <span>{{ 'core.settings.phone.steps.autostart' | transloco }}</span>
                <button matButton="tonal" (click)="openAutostart()">
                  {{ 'core.settings.phone.open' | transloco }}
                </button>
              </div>
              <p class="hint">{{ 'core.settings.phone.where' | transloco }}</p>
              <button matButton (click)="disable()">
                {{ 'core.settings.phone.disable' | transloco }}
              </button>
            }
            @if (error()) {
              <p class="error" role="alert">{{ 'core.settings.phone.error' | transloco }}</p>
            }
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding-top: 12px;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .ok {
      color: var(--mat-sys-primary);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class PhoneSensorsComponent {
  private readonly activity = activityApi(inject(DASHBOARD_CLIENT).api);

  protected readonly steps: Step[] = ['usageAccess', 'notificationAccess', 'unrestricted'];
  protected readonly available = signal(false);
  protected readonly status = signal<PhoneSensorsStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal(false);

  constructor() {
    void this.refresh();
    // Back from Android's settings: what was allowed shows at once.
    const resumed = App.addListener('resume', () => void this.refresh()).catch(() => null);
    inject(DestroyRef).onDestroy(() => void resumed.then((handle) => handle?.remove()));
  }

  protected async enable(): Promise<void> {
    const plugin = await phoneSensors();
    const server = mobileServer();
    if (!plugin || !server) {
      return;
    }
    this.busy.set(true);
    this.error.set(false);
    try {
      const device = await this.activity.registerDevice({
        name: phoneModel(navigator.userAgent),
        platform: 'android',
      });
      await plugin.configure({ server, token: device.token });
      await this.refresh();
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected async disable(): Promise<void> {
    await (await phoneSensors())?.disable();
    await this.refresh();
  }

  protected async open(step: Step): Promise<void> {
    const plugin = await phoneSensors();
    if (step === 'usageAccess') {
      await plugin?.openUsageAccess();
    } else if (step === 'notificationAccess') {
      await plugin?.openNotificationAccess();
    } else {
      await plugin?.openBattery();
    }
  }

  protected async openAutostart(): Promise<void> {
    await (await phoneSensors())?.openAutostart();
  }

  private async refresh(): Promise<void> {
    const plugin = await phoneSensors();
    this.available.set(plugin !== null);
    this.status.set(plugin ? await plugin.status() : null);
    // Allowed just now: the first collection goes at once, not in 15 minutes.
    if (this.status()?.configured) {
      void plugin?.syncNow();
    }
  }
}
