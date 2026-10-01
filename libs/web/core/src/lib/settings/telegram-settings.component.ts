import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CORE_READS, notificationsApi } from '@pd/client-core';
import { NotificationSettings } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';

/** Telegram: where notifications go and where the assistant answers. */
@Component({
  selector: 'pd-telegram-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>send</mat-icon>
        <mat-card-title>Telegram</mat-card-title>
        <mat-card-subtitle>{{
          'core.settings.telegram.description' | transloco
        }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (settings.value(); as s) {
          @if (!s.telegram.available) {
            <p>{{ 'core.settings.telegram.notConfigured' | transloco }}</p>
          } @else if (s.telegram.connected) {
            <p class="ok">
              <mat-icon>check_circle</mat-icon>
              {{ 'core.settings.telegram.connected' | transloco }}
            </p>
          } @else {
            <p>{{ 'core.settings.telegram.notConnected' | transloco }}</p>
            @if (linkOpened()) {
              <p class="hint">{{ 'core.settings.telegram.afterStart' | transloco }}</p>
            }
          }
        }
      </mat-card-content>
      @if (settings.value()?.telegram; as telegram) {
        <mat-card-actions>
          @if (telegram.available && !telegram.connected) {
            <button matButton="filled" (click)="connect()">
              {{ 'core.settings.telegram.connect' | transloco }}
            </button>
            <button matButton (click)="settings.reload()">
              {{ 'core.settings.telegram.check' | transloco }}
            </button>
          }
          @if (telegram.connected) {
            <button matButton="filled" (click)="sendTest()">
              {{ 'core.settings.telegram.test' | transloco }}
            </button>
            <button matButton (click)="disconnect()">
              {{ 'core.settings.telegram.disconnect' | transloco }}
            </button>
          }
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .ok {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-primary);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TelegramSettingsComponent {
  private readonly notifications = notificationsApi(inject(DASHBOARD_CLIENT).api);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly settings = httpResource<NotificationSettings>(() =>
    CORE_READS.notificationSettings(),
  );
  protected readonly linkOpened = signal(false);

  async connect(): Promise<void> {
    const link = await this.notifications.linkTelegram();
    window.open(link.deepLink, '_blank');
    this.linkOpened.set(true);
  }

  async disconnect(): Promise<void> {
    await this.notifications.unlinkTelegram();
    this.settings.reload();
  }

  async sendTest(): Promise<void> {
    await this.notifications.sendTest();
    this.snackBar.open(this.transloco.translate('core.settings.telegram.testSent'), 'OK', {
      duration: 3000,
    });
  }
}
