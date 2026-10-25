import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CORE_READS, pushApi } from '@pd/client-core';
import { PushStatus } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { isMobileApp } from '../mobile/mobile-app';
import { MobilePushService } from '../mobile/mobile-push.service';
import { DeviceOnlyComponent } from './device-only.component';
import { IntegrationGuideComponent } from '../ui/integration-guide.component';
import { ServerKeyComponent, ServerKeyField } from '../ui/server-key.component';

/**
 * Push notifications on the phone (the Android app), next to Telegram: the owner sets the
 * server's Firebase key once; each phone of the app switches them on for itself.
 */
@Component({
  selector: 'pd-push-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DeviceOnlyComponent,
    IntegrationGuideComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    ServerKeyComponent,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>notifications_active</mat-icon>
        <mat-card-title>{{ 'core.settings.push.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.push.description' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (status.value(); as s) {
          @if (!s.keySet && !s.owner) {
            <p>{{ 'core.settings.push.notConfigured' | transloco }}</p>
          }
          @if (s.keySet) {
            @for (device of s.devices; track device.id) {
              <p class="device">
                <mat-icon>smartphone</mat-icon>
                {{ device.name }}
                @if (device.lastSentAt) {
                  <span class="hint">
                    · {{ 'core.settings.push.lastSent' | transloco }}
                    {{ device.lastSentAt | date: 'd MMM, HH:mm' }}
                  </span>
                }
              </p>
            } @empty {
              <p>{{ 'core.settings.push.noPhones' | transloco }}</p>
            }
            <!-- Switched on per phone: the rest of the card is the server's. -->
            <pd-device-only kind="phone" />
            @if (inApp) {
              <p class="hint">{{ 'core.settings.push.phone.' + phone.state() | transloco }}</p>
            }
          }
          @if (s.owner) {
            <pd-integration-guide
              guide="core.settings.push.guide"
              [steps]="5"
              link="https://console.firebase.google.com"
            />
            <pd-server-key
              [fields]="keyFields"
              [set]="s.keySet"
              [summary]="s.projectId"
              [problem]="s.keyError"
              [save]="saveKey"
              [remove]="removeKey"
              (changed)="status.reload()"
            />
          }
        }
      </mat-card-content>
      @if (status.value(); as s) {
        @if (s.keySet) {
          <mat-card-actions>
            @if (inApp) {
              @if (phone.state() === 'on') {
                <button matButton (click)="disable()">
                  {{ 'core.settings.push.disable' | transloco }}
                </button>
              } @else {
                <button matButton="filled" (click)="enable()">
                  {{ 'core.settings.push.enable' | transloco }}
                </button>
              }
            }
            @if (s.devices.length) {
              <button matButton="filled" (click)="sendTest()">
                {{ 'core.settings.push.test' | transloco }}
              </button>
            }
          </mat-card-actions>
        }
      }
    </mat-card>
  `,
  styles: `
    .device {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class PushSettingsComponent {
  private readonly push = pushApi(inject(DASHBOARD_CLIENT).api);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly phone = inject(MobilePushService);
  /** Opened in the Android app: this phone can switch them on and off. */
  protected readonly inApp = isMobileApp();
  protected readonly status = httpResource<PushStatus>(() => CORE_READS.push());

  constructor() {
    // The check at the app's start may have run before the sign-in was known: read it again.
    if (this.inApp) {
      void this.phone.sync().catch(() => undefined);
    }
  }
  protected readonly keyFields: ServerKeyField[] = [
    {
      name: 'serviceAccount',
      label: 'core.settings.push.key',
      multiline: true,
      placeholder: '{ "type": "service_account", … }',
    },
  ];
  protected readonly saveKey = (values: Record<string, string>) =>
    this.push.setKey({ serviceAccount: values['serviceAccount'] });
  protected readonly removeKey = () => this.push.removeKey();

  protected async enable(): Promise<void> {
    await this.phone.enable();
    // The phone tells the server its token a moment later.
    setTimeout(() => this.status.reload(), 3000);
  }

  protected async disable(): Promise<void> {
    await this.phone.disable();
    this.status.reload();
  }

  protected async sendTest(): Promise<void> {
    const ok = await this.push.test().then(
      () => true,
      () => false,
    );
    this.snackBar.open(
      this.transloco.translate(
        ok ? 'core.settings.push.testSent' : 'core.settings.push.testFailed',
      ),
      'OK',
      { duration: 4000 },
    );
    this.status.reload();
  }
}
