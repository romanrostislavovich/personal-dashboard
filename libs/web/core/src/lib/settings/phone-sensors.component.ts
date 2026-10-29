import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { App } from '@capacitor/app';
import { activityApi, appsApi } from '@pd/client-core';
import { ActivityDevice } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { apiBaseUrl, isMobileApp, mobileServer, phoneModel } from '../mobile/mobile-app';
import { DeviceOnlyComponent } from './device-only.component';
import {
  checkPhoneSensors,
  PhoneExtra,
  PhoneSensorsCheck,
  PhoneSensorsStatus,
} from '../mobile/phone-sensors';

type Step = 'usageAccess' | 'notificationAccess' | 'location' | 'unrestricted';
type Plugin = NonNullable<PhoneSensorsCheck['plugin']>;

/** How long a step of switching on may take. */
const STEP_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`no answer in ${ms / 1000} s`)), ms),
    ),
  ]);
}

function describe(failure: unknown): string {
  if (failure && typeof failure === 'object' && 'status' in failure) {
    return `HTTP ${(failure as { status: unknown }).status}`;
  }
  return failure instanceof Error ? failure.message : String(failure);
}

/**
 * Settings → Devices: the phone as a sensor. Inside the Android app it is set here; elsewhere
 * the card shows which phones collect and when each last sent something. Switching it on makes the phone
 * a device of the Activity section (its time in apps there, its notifications in Activity →
 * Notifications); then each permission Android asks for has a button to its settings screen,
 * and MIUI's autostart one too. The checks are read again when the user comes back.
 */
@Component({
  selector: 'pd-phone-sensors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DeviceOnlyComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>sensors</mat-icon>
        <mat-card-title>{{ 'core.settings.phone.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.phone.hint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        <pd-device-only kind="phone" />
        @if (!inApp) {
          <!-- Elsewhere: the phones that collect, and when each last told something. -->
          @for (phone of phones(); track phone.id) {
            <div class="step">
              <mat-icon>smartphone</mat-icon>
              <span>{{ phone.name }}</span>
              <span class="hint">
                @if (phone.lastSeenAt) {
                  {{ 'core.settings.phone.lastSeen' | transloco }}
                  {{ phone.lastSeenAt | date: 'd MMM, HH:mm' }}
                } @else {
                  {{ 'core.settings.phone.neverSeen' | transloco }}
                }
              </span>
            </div>
          } @empty {
            <p class="hint">{{ 'core.settings.phone.noPhones' | transloco }}</p>
          }
        }
        @if (inApp && available() === null) {
          <p class="hint">{{ 'core.settings.phone.checking' | transloco }}</p>
        }
        @if (inApp && available() === false) {
          <!-- An APK built before the collection, or one whose native part does not answer. -->
          <p>{{ 'core.settings.phone.update' | transloco }}</p>
          @if (checkError(); as reason) {
            <p class="hint">
              {{ 'core.settings.phone.reason' | transloco }}: <code>{{ reason }}</code>
            </p>
          }
          <button matButton (click)="refresh()">
            {{ 'core.settings.phone.again' | transloco }}
          </button>
          @if (apkUrl(); as url) {
            <a matButton="filled" [href]="url" target="_blank" rel="noopener">
              <mat-icon>download</mat-icon>
              {{ 'core.settings.apps.mobile.apk' | transloco }}
            </a>
          }
        }
        @if (status(); as s) {
          @if (!s.configured) {
            <button matButton="filled" [disabled]="busy()" (click)="enable()">
              {{ 'core.settings.phone.enable' | transloco }}
            </button>
          } @else {
            @for (step of steps; track step) {
              <!-- An APK built before a step does not tell it: no button that cannot work. -->
              @if (s[step] !== undefined) {
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
            }
            @if (hasExtras(s)) {
              <p class="extras">{{ 'core.settings.phone.extrasTitle' | transloco }}</p>
              @for (extra of extras; track extra) {
                @if (s[extra] !== undefined) {
                  <div class="step">
                    <mat-icon [class.ok]="s[extra]">
                      {{ s[extra] ? 'check_circle' : 'radio_button_unchecked' }}
                    </mat-icon>
                    <span>{{ 'core.settings.phone.extras.' + extra | transloco }}</span>
                    @if (!s[extra]) {
                      <button matButton="tonal" (click)="allow(extra)">
                        {{ 'core.settings.phone.allow' | transloco }}
                      </button>
                    }
                  </div>
                }
              }
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
          @if (error(); as reason) {
            <p class="error" role="alert">
              {{ 'core.settings.phone.error' | transloco }} <code>{{ reason }}</code>
            </p>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding-top: 12px;
    }
    /* The icon stays beside its words on a narrow phone; a long label wraps, not the row. */
    .step {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
    .step > span {
      flex: 1;
      min-width: 0;
    }
    .step > mat-icon,
    .step > button {
      flex: none;
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
    .extras {
      margin: 8px 0 0;
      font: var(--mat-sys-title-small);
    }
  `,
})
export class PhoneSensorsComponent {
  private readonly activity = activityApi(inject(DASHBOARD_CLIENT).api);
  private readonly apps = appsApi(inject(DASHBOARD_CLIENT).api);

  /** The optional signals: each is asked for only when the user wants it. */
  protected readonly extras: PhoneExtra[] = [
    'steps',
    'calls',
    'photos',
    'microphone',
    'bluetooth',
    'health',
  ];

  protected hasExtras(status: PhoneSensorsStatus): boolean {
    return this.extras.some((extra) => status[extra] !== undefined);
  }

  protected allow(kind: PhoneExtra): Promise<void> {
    return this.openScreen((plugin) => plugin.allow({ kind }));
  }

  protected readonly steps: Step[] = [
    'usageAccess',
    'notificationAccess',
    'location',
    'unrestricted',
  ];
  /** Only the Android app collects; a browser shows nothing here. */
  protected readonly inApp = isMobileApp();
  /** The APK this server hands out, for an app too old to collect. */
  protected readonly apkUrl = signal<string | null>(null);
  /** Whether this APK can collect; `null` — not known yet (asked of the app). */
  protected readonly available = signal<boolean | null>(null);
  /** What the app answered when it could not collect, to be told on. */
  protected readonly checkError = signal<string | null>(null);
  protected readonly status = signal<PhoneSensorsStatus | null>(null);
  protected readonly busy = signal(false);
  /** Why switching on failed, as the step that failed told it; `null` — it did not. */
  protected readonly error = signal<string | null>(null);
  /** Outside the app: the phones that collect (devices of Activity on Android). */
  protected readonly phones = signal<ActivityDevice[]>([]);

  constructor() {
    if (!this.inApp) {
      void this.activity.devices().then(
        (devices) => this.phones.set(devices.filter((device) => device.platform === 'android')),
        () => undefined,
      );
      return;
    }
    void this.refresh();
    if (this.inApp) {
      void this.apps.overview().then(
        (overview) => {
          const apk = overview.apps.find((app) => app.kind === 'mobile')?.downloads[0];
          this.apkUrl.set(apk ? `${apiBaseUrl()}${apk.url}` : null);
        },
        () => undefined,
      );
    }
    // Back from Android's settings: what was allowed shows at once.
    const resumed = App.addListener('resume', () => void this.refresh()).catch(() => null);
    inject(DestroyRef).onDestroy(() => void resumed.then((handle) => handle?.remove()));
  }

  /** Each step says where it stopped: a phone's problem can only be told from its words. */
  protected async enable(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { plugin, error } = await checkPhoneSensors();
      const server = mobileServer();
      if (!plugin) {
        throw new Error(`app: ${error ?? 'no collection in this version'}`);
      }
      if (!server) {
        throw new Error('no server address');
      }
      const device = await this.activity
        .registerDevice({ name: phoneModel(navigator.userAgent), platform: 'android' })
        .catch((failure: unknown) => {
          throw new Error(`server: ${describe(failure)}`);
        });
      await withTimeout(plugin.configure({ server, token: device.token }), STEP_MS).catch(
        (failure: unknown) => {
          throw new Error(`app: ${describe(failure)}`);
        },
      );
      await this.refresh();
    } catch (failure) {
      this.error.set(describe(failure));
    } finally {
      this.busy.set(false);
    }
  }

  protected async disable(): Promise<void> {
    this.error.set(null);
    try {
      await this.withPlugin((plugin) => plugin.disable());
      await this.refresh();
    } catch (failure) {
      this.error.set(describe(failure));
    }
  }

  protected open(step: Step): Promise<void> {
    return this.openScreen(async (plugin) => {
      if (step === 'usageAccess') {
        await plugin.openUsageAccess();
      } else if (step === 'notificationAccess') {
        await plugin.openNotificationAccess();
      } else if (step === 'location') {
        await plugin.openLocation();
      } else {
        await plugin.openBattery();
      }
    });
  }

  protected openAutostart(): Promise<void> {
    return this.openScreen((plugin) => plugin.openAutostart());
  }

  /** A settings screen of Android; when it does not open, the reason shows under the steps. */
  private async openScreen(run: (plugin: Plugin) => Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await this.withPlugin(run);
    } catch (failure) {
      this.error.set(`settings: ${describe(failure)}`);
    }
  }

  /** One call of the app, or an error saying why it did not answer. */
  private async withPlugin(run: (plugin: Plugin) => Promise<void>): Promise<void> {
    const { plugin, error } = await checkPhoneSensors();
    if (!plugin) {
      throw new Error(`app: ${error ?? 'no collection in this version'}`);
    }
    await withTimeout(run(plugin), STEP_MS);
  }

  protected async refresh(): Promise<void> {
    this.available.set(null);
    const { plugin, error } = await checkPhoneSensors();
    this.available.set(plugin !== null);
    this.checkError.set(error);
    this.status.set(plugin ? await plugin.status() : null);
    // Allowed just now: the first collection goes at once, not in 15 minutes.
    if (this.status()?.configured) {
      void plugin?.syncNow();
    }
  }
}
