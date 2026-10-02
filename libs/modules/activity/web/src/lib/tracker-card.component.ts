import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ActivityDevice, ActivityPlatform } from '@pd/contracts';
import { desktopBridge, DesktopActivityStatus } from '@pd/web-core';
import { firstValueFrom } from 'rxjs';
import { ActivityApi } from './activity.api';

const PLATFORMS: Record<string, ActivityPlatform> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

/**
 * The trackers: this computer (when the dashboard is opened in the desktop app, tracking is
 * switched on and paused here) and every device that reports, with a way to rename or remove it.
 */
@Component({
  selector: 'pd-activity-tracker-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>devices</mat-icon>
        <mat-card-title>{{ 'activity.tracker.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (!desktop) {
          <p class="hint">{{ 'activity.tracker.browser' | transloco }}</p>
        } @else if (status(); as s) {
          @if (!s.supported) {
            <p class="hint">{{ 'activity.tracker.unsupported' | transloco }}</p>
          } @else if (!s.deviceId) {
            <p class="hint">{{ 'activity.tracker.off' | transloco }}</p>
            <button matButton="filled" (click)="enable()" [disabled]="busy()">
              <mat-icon>play_arrow</mat-icon> {{ 'activity.tracker.enable' | transloco }}
            </button>
          } @else {
            <p class="state" [class.paused]="s.paused">
              <mat-icon inline>{{ s.paused ? 'pause_circle' : 'radio_button_checked' }}</mat-icon>
              {{ (s.paused ? 'activity.tracker.paused' : 'activity.tracker.on') | transloco }}
              @if (s.pending > 0) {
                <span class="hint">
                  · {{ 'activity.tracker.pending' | transloco: { count: s.pending } }}
                </span>
              }
            </p>
            <div class="actions">
              @if (s.paused) {
                <button matButton (click)="pause(null)">
                  <mat-icon>play_arrow</mat-icon> {{ 'activity.tracker.resume' | transloco }}
                </button>
              } @else {
                <button matButton (click)="pause(60)">
                  <mat-icon>pause</mat-icon> {{ 'activity.tracker.pauseHour' | transloco }}
                </button>
                <button matButton (click)="pause(0)">
                  {{ 'activity.tracker.pauseUntil' | transloco }}
                </button>
              }
              <button matButton (click)="disable()" [disabled]="busy()">
                {{ 'activity.tracker.disable' | transloco }}
              </button>
            </div>
          }
        }

        @if (devices.value().length) {
          <ul class="devices">
            @for (device of devices.value(); track device.id) {
              <li>
                <mat-icon inline>{{
                  device.platform === 'android' || device.platform === 'ios'
                    ? 'smartphone'
                    : 'computer'
                }}</mat-icon>
                <span class="name">
                  {{ device.name }}
                  @if (device.id === status()?.deviceId) {
                    <span class="hint">· {{ 'activity.tracker.thisDevice' | transloco }}</span>
                  }
                </span>
                <span class="hint">
                  @if (device.lastSeenAt) {
                    {{ device.lastSeenAt | date: 'd MMM, HH:mm' }}
                  } @else {
                    {{ 'activity.tracker.neverSeen' | transloco }}
                  }
                </span>
                <button
                  matIconButton
                  [matTooltip]="'activity.tracker.rename' | transloco"
                  [attr.aria-label]="'activity.tracker.rename' | transloco"
                  (click)="rename(device)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  matIconButton
                  [matTooltip]="'core.actions.delete' | transloco"
                  [attr.aria-label]="'core.actions.delete' | transloco"
                  (click)="remove(device)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </li>
            }
          </ul>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .state {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 0 4px;
      color: var(--pd-success);
      font-weight: 600;
    }
    .state.paused {
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .devices {
      list-style: none;
      margin: 12px 0 0;
      padding: 0;
    }
    .devices li {
      display: flex;
      align-items: center;
      gap: 8px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class TrackerCardComponent {
  private readonly api = inject(ActivityApi);
  private readonly transloco = inject(TranslocoService);

  /** The tracker of the desktop shell; `null` — the dashboard is opened in a browser. */
  protected readonly desktop = desktopBridge()?.activity ?? null;
  protected readonly status = signal<DesktopActivityStatus | null>(null);
  protected readonly devices = this.api.devices();
  protected readonly busy = signal(false);
  /** A device was added or removed: the statistics have another set of devices. */
  readonly changed = output<void>();

  constructor() {
    void this.refresh();
  }

  /** Registers this computer as a device and hands its token to the tracker. */
  protected async enable(): Promise<void> {
    if (!this.desktop) {
      return;
    }
    this.busy.set(true);
    try {
      const device = await firstValueFrom(
        this.api.registerDevice({
          name: this.desktop.hostname || this.transloco.translate('activity.tracker.computer'),
          platform: PLATFORMS[this.desktop.platform] ?? 'windows',
        }),
      );
      await this.desktop.enable({ id: device.id, token: device.token });
    } finally {
      this.busy.set(false);
      await this.refresh();
    }
  }

  /** Stops tracking here; what the computer has recorded stays (the device is not removed). */
  protected async disable(): Promise<void> {
    await this.desktop?.disable();
    await this.refresh();
  }

  protected async pause(minutes: number | null): Promise<void> {
    await this.desktop?.pause(minutes);
    await this.refresh();
  }

  protected async rename(device: ActivityDevice): Promise<void> {
    const name = prompt(this.transloco.translate('activity.tracker.rename'), device.name)?.trim();
    if (name && name !== device.name) {
      await firstValueFrom(this.api.renameDevice(device.id, name));
      this.devices.reload();
      this.changed.emit();
    }
  }

  protected async remove(device: ActivityDevice): Promise<void> {
    if (
      !confirm(this.transloco.translate('activity.tracker.confirmRemove', { name: device.name }))
    ) {
      return;
    }
    await firstValueFrom(this.api.removeDevice(device.id));
    if (device.id === this.status()?.deviceId) {
      await this.desktop?.disable();
    }
    await this.refresh();
    this.changed.emit();
  }

  private async refresh(): Promise<void> {
    this.status.set((await this.desktop?.status()) ?? null);
    this.devices.reload();
  }
}
