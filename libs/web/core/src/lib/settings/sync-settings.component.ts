import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { SyncStatus } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';

/** Sync between this computer and the server (docs/sync.md): what this instance is and how it syncs. */
@Component({
  selector: 'pd-sync-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatCardModule, MatButtonModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>sync</mat-icon>
        <mat-card-title>{{ 'core.settings.sync.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.sync.description' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (status.value(); as s) {
          @let time = s.lastSyncedAt ? (s.lastSyncedAt | date: 'short') : never();
          @switch (s.mode) {
            @case ('off') {
              <p>{{ 'core.settings.sync.off' | transloco }}</p>
            }
            @case ('server') {
              <p>{{ 'core.settings.sync.server' | transloco }}</p>
              <p>{{ 'core.settings.sync.lastContact' | transloco: { time } }}</p>
            }
            @case ('client') {
              <p>{{ 'core.settings.sync.client' | transloco: { url: s.serverUrl } }}</p>
              <p>{{ 'core.settings.sync.lastSynced' | transloco: { time } }}</p>
              @if (s.lastError) {
                <p class="error"><mat-icon>cloud_off</mat-icon>{{ s.lastError }}</p>
              }
              @if (s.pendingChanges) {
                <p>{{ 'core.settings.sync.pending' | transloco: { count: s.pendingChanges } }}</p>
              }
            }
          }
          @if (s.parked) {
            <p class="hint">{{ 'core.settings.sync.parked' | transloco: { count: s.parked } }}</p>
          }
          @if (s.conflicts) {
            <p class="hint">
              {{ 'core.settings.sync.conflicts' | transloco: { count: s.conflicts } }}
            </p>
          }
        }
      </mat-card-content>
      @if (status.value()?.mode === 'client') {
        <mat-card-actions>
          <button matButton="filled" [disabled]="syncing()" (click)="syncNow()">
            {{ 'core.settings.sync.syncNow' | transloco }}
          </button>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    .error {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--mat-sys-error);
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SyncSettingsComponent {
  private readonly http = inject(HttpClient);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly status = httpResource<SyncStatus>(() => '/api/sync/status');
  protected readonly syncing = signal(false);

  protected never(): string {
    return this.transloco.translate('core.settings.sync.never');
  }

  async syncNow(): Promise<void> {
    this.syncing.set(true);
    try {
      const status = await firstValueFrom(this.http.post<SyncStatus>('/api/sync/run', {}));
      this.status.set(status);
      if (!status.lastError) {
        this.snackBar.open(this.transloco.translate('core.settings.sync.synced'), 'OK', {
          duration: 3000,
        });
      }
    } finally {
      this.syncing.set(false);
    }
  }
}
