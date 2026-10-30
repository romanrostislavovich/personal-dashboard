import {DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatSnackBar} from '@angular/material/snack-bar';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  IntegrationGuideComponent,
  ServerKeyComponent,
  ServerKeyField,
} from '@pd/web-core';
import {HealthApi} from '../health.api';

/**
 * Google Health (the Fitbit band), in Settings → Integrations (see `integrations` in
 * health.module.ts): the owner sets the keys of a Google Cloud app once, then a user signs in
 * with Google. The sign-in comes back here with `?googleHealth=connected|error`.
 */
@Component({
  selector: 'pd-google-health-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    IntegrationGuideComponent,
    ServerKeyComponent,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>watch</mat-icon>
        <mat-card-title>Google Health</mat-card-title>
        <mat-card-subtitle>{{
          'health.band.integration.subtitle' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      @if (status.value(); as s) {
        <mat-card-content>
          @if (!s.available) {
            <p class="hint">
              {{ 'health.band.integration.notConfigured' | transloco }}
            </p>
          } @else if (s.connected) {
            <p class="ok">
              <mat-icon inline>check_circle</mat-icon>
              {{ 'health.band.integration.connected' | transloco }}
            </p>
            @if (s.lastSyncedAt) {
              <p class="hint">
                {{ 'health.band.integration.synced' | transloco }}
                {{ s.lastSyncedAt | date: 'short' }}
              </p>
            }
            @if (s.error) {
              <p class="error">
                {{ 'health.band.integration.failed' | transloco }} {{ s.error }}
              </p>
            }
          } @else {
            <p class="hint">{{ 'health.band.integration.hint' | transloco }}</p>
          }
          <pd-integration-guide
            guide="health.band.guide"
            [steps]="6"
            link="https://console.cloud.google.com/apis/library/health.googleapis.com"
          />
          @if (s.app; as app) {
            <pd-server-key
              [fields]="fields"
              [set]="s.available"
              [summary]="app.clientId"
              [initial]="{clientId: app.clientId}"
              [save]="saveApp"
              [remove]="removeApp"
              (changed)="status.reload()"
            />
            <p class="hint">
              {{ 'health.band.integration.redirectUri' | transloco }}
              <code>{{ app.redirectUri }}</code>
            </p>
          }
        </mat-card-content>
        @if (s.available) {
          <mat-card-actions align="end">
            @if (s.connected) {
              <button matButton (click)="disconnect()" [disabled]="busy()">
                {{ 'health.band.integration.disconnect' | transloco }}
              </button>
              <button matButton="tonal" (click)="sync()" [disabled]="busy()">
                {{ 'health.band.integration.sync' | transloco }}
              </button>
            } @else {
              <button
                matButton="filled"
                (click)="connect()"
                [disabled]="busy()"
              >
                {{ 'health.band.integration.connect' | transloco }}
              </button>
            }
          </mat-card-actions>
        }
      }
    </mat-card>
  `,
  styles: `
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
    .error {
      color: var(--mat-sys-error);
    }
    code {
      word-break: break-all;
    }
  `,
})
export class GoogleHealthIntegration {
  private readonly api = inject(HealthApi);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly status = this.api.wearable();
  protected readonly busy = signal(false);
  protected readonly fields: ServerKeyField[] = [
    {
      name: 'clientId',
      label: 'health.band.integration.clientId',
      placeholder: '…apps.googleusercontent.com',
    },
    {
      name: 'clientSecret',
      label: 'health.band.integration.clientSecret',
      secret: true,
    },
  ];
  protected readonly saveApp = (values: Record<string, string>) =>
    this.api.client.setGoogleHealthApp({
      clientId: values['clientId'],
      clientSecret: values['clientSecret'],
    });
  protected readonly removeApp = () => this.api.client.removeGoogleHealthApp();

  constructor() {
    this.showSignInResult();
  }

  /** Go to the Google sign-in page; it sends us back to the settings with `?googleHealth=…`. */
  async connect(): Promise<void> {
    await this.run(async () => {
      const {url} = await this.api.client.wearableConnectUrl();
      window.location.href = url;
    });
  }

  async sync(): Promise<void> {
    await this.run(() => this.api.client.syncWearable());
  }

  async disconnect(): Promise<void> {
    await this.run(() => this.api.client.disconnectWearable());
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch {
      this.snackBar.open(
        this.transloco.translate('health.band.integration.actionFailed'),
        'OK',
        {
          duration: 8000,
        },
      );
    } finally {
      this.busy.set(false);
      this.status.reload();
    }
  }

  private showSignInResult(): void {
    const result =
      inject(ActivatedRoute).snapshot.queryParamMap.get('googleHealth');
    if (result) {
      this.snackBar.open(
        this.transloco.translate(`health.band.integration.${result}`),
        'OK',
        {
          duration: 5000,
        },
      );
      // Remove the parameter so the message does not repeat on reload; the tab stays.
      void inject(Router).navigate([], {
        queryParams: {googleHealth: null},
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }
}
