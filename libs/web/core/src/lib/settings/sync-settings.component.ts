import { DatePipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CORE_READS, syncApi } from '@pd/client-core';
import { SyncStatus } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { SyncConflictsComponent } from './sync-conflicts.component';

/**
 * Sync between this computer and the server (docs/sync.md): what this instance is, how it syncs,
 * whether its data matches the server's, and its backups (docs/deploy.md, "Backups").
 */
@Component({
  selector: 'pd-sync-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    SyncConflictsComponent,
    TranslocoPipe,
  ],
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
              @if (s.reconcile; as r) {
                @if (r.mismatches.length) {
                  <div class="warning">
                    <mat-icon>report</mat-icon>
                    <div>
                      <p>{{ 'core.settings.sync.mismatch' | transloco }}</p>
                      <ul>
                        @for (m of r.mismatches; track m.table) {
                          <li>
                            {{ m.table }}:
                            {{
                              'core.settings.sync.mismatchRows'
                                | transloco
                                  : { local: m.localRows ?? '—', server: m.serverRows ?? '—' }
                            }}
                          </li>
                        }
                      </ul>
                    </div>
                  </div>
                } @else {
                  <p class="ok">
                    <mat-icon>verified</mat-icon>
                    {{
                      'core.settings.sync.matches'
                        | transloco: { time: (r.checkedAt | date: 'short') }
                    }}
                  </p>
                }
              }
            }
          }
          @if (s.parked || s.conflicts) {
            <p class="hint">
              @if (s.conflicts) {
                {{ 'core.settings.sync.conflicts' | transloco: { count: s.conflicts } }}
              }
              @if (s.parked) {
                {{ 'core.settings.sync.parked' | transloco: { count: s.parked } }}
              }
              <button matButton (click)="showSetAside.set(!showSetAside())">
                {{
                  (showSetAside() ? 'core.settings.sync.hide' : 'core.settings.sync.show')
                    | transloco
                }}
              </button>
            </p>
          }
          @if (showSetAside()) {
            <pd-sync-conflicts (changed)="status.reload()" />
          }

          @if (s.backup; as b) {
            <h3>{{ 'core.settings.sync.backup.title' | transloco }}</h3>
            @if (b.latest; as latest) {
              <p>
                {{
                  (s.mode === 'client'
                    ? 'core.settings.sync.backup.latestCopy'
                    : 'core.settings.sync.backup.latest'
                  )
                    | transloco
                      : {
                          time: (latest.createdAt | date: 'short'),
                          size: (latest.size / 1048576 | number: '1.0-1'),
                          count: b.count,
                        }
                }}
              </p>
            }
            <p class="hint">
              {{ 'core.settings.sync.backup.folder' | transloco: { folder: b.folder } }}
            </p>
            @if (b.restoreCheck; as check) {
              @if (check.ok) {
                <p class="ok">
                  <mat-icon>verified</mat-icon>
                  {{
                    'core.settings.sync.backup.restoreOk'
                      | transloco
                        : {
                            time: (check.checkedAt | date: 'short'),
                            tables: check.tables,
                            rows: (check.rows | number),
                          }
                  }}
                </p>
              } @else if (check.error) {
                <p class="error">
                  <mat-icon>error</mat-icon>
                  {{ 'core.settings.sync.backup.restoreError' | transloco: { error: check.error } }}
                </p>
              }
              @for (m of check.mismatches; track m.table) {
                <p class="error">
                  <mat-icon>error</mat-icon>
                  {{ 'core.settings.sync.backup.restoreMismatch' | transloco: m }}
                </p>
              }
            }
            @for (problem of b.problems; track problem) {
              <p class="error">
                <mat-icon>warning</mat-icon>
                {{ 'core.settings.sync.backup.problems.' + s.mode + '.' + problem | transloco }}
              </p>
            }
            @if (b.lastError) {
              <p class="error"><mat-icon>cloud_off</mat-icon>{{ b.lastError }}</p>
            }
          }
        }
      </mat-card-content>
      @if (status.value()?.mode === 'client') {
        <mat-card-actions>
          <button matButton="filled" [disabled]="busy()" (click)="syncNow()">
            {{ 'core.settings.sync.syncNow' | transloco }}
          </button>
          <button matButton [disabled]="busy()" (click)="copyBackup()">
            {{ 'core.settings.sync.backup.copyNow' | transloco }}
          </button>
          <button matButton [disabled]="busy()" (click)="resync()">
            {{ 'core.settings.sync.resync' | transloco }}
          </button>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    h3 {
      margin: 16px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .error,
    .ok,
    .warning {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .warning {
      align-items: flex-start;
      color: var(--mat-sys-error);
    }
    .warning p,
    .warning ul {
      margin: 0;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SyncSettingsComponent {
  private readonly sync = syncApi(inject(DASHBOARD_CLIENT).api);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly status = httpResource<SyncStatus>(() => CORE_READS.syncStatus());
  protected readonly busy = signal(false);
  protected readonly showSetAside = signal(false);

  protected never(): string {
    return this.transloco.translate('core.settings.sync.never');
  }

  protected syncNow(): Promise<void> {
    return this.run(() => this.sync.runNow(), 'core.settings.sync.synced');
  }

  protected copyBackup(): Promise<void> {
    return this.run(() => this.sync.copyBackup(), 'core.settings.sync.backup.copied');
  }

  protected resync(): Promise<void> {
    if (!confirm(this.transloco.translate('core.settings.sync.confirmResync'))) {
      return Promise.resolve();
    }
    return this.run(() => this.sync.resyncEverything(), 'core.settings.sync.synced');
  }

  /** Runs an action that answers with the new status; a failure shows up in the status. */
  private async run(action: () => Promise<SyncStatus>, done: string): Promise<void> {
    this.busy.set(true);
    try {
      const status = await action();
      this.status.set(status);
      if (!status.lastError && !status.backup?.lastError) {
        this.snackBar.open(this.transloco.translate(done), 'OK', { duration: 3000 });
      }
    } finally {
      this.busy.set(false);
    }
  }
}
