import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { desktopBridge } from '../realtime/desktop-bridge';
import { desktopNotificationsOn, setDesktopNotifications } from '../realtime/desktop-notifications';
import { DeviceOnlyComponent } from './device-only.component';

/**
 * The desktop app's system notifications: on this computer, on or off, and a test. Which
 * sections come here is in "What comes where"; the quiet hours keep them quiet like Telegram.
 */
@Component({
  selector: 'pd-desktop-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DeviceOnlyComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>desktop_windows</mat-icon>
        <mat-card-title>{{
          'core.settings.desktopNotifications.title' | transloco
        }}</mat-card-title>
        <mat-card-subtitle>
          {{ 'core.settings.desktopNotifications.hint' | transloco }}
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content class="content">
        <pd-device-only kind="desktop" />
        @if (canNotify) {
          <mat-slide-toggle [checked]="on()" (change)="toggle($event.checked)">
            {{ 'core.settings.desktopNotifications.on' | transloco }}
          </mat-slide-toggle>
          <button matButton="tonal" [disabled]="!on()" (click)="test()">
            {{ 'core.settings.desktopNotifications.test' | transloco }}
          </button>
        } @else {
          <p class="hint">{{ 'core.settings.desktopNotifications.elsewhere' | transloco }}</p>
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
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DesktopNotificationsComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly desktop = desktopBridge();

  protected readonly canNotify = !!this.desktop?.notify;
  protected readonly on = signal(desktopNotificationsOn());

  protected toggle(on: boolean): void {
    setDesktopNotifications(on);
    this.on.set(on);
  }

  /** Shown at once, even with the window in front: the user asked for it. */
  protected test(): void {
    this.desktop?.notify?.({
      title: this.transloco.translate('core.settings.desktopNotifications.testTitle'),
      body: this.transloco.translate('core.settings.desktopNotifications.testBody'),
      route: '/settings?tab=notifications',
    });
  }
}
