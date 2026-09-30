import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { syncApi } from '@pd/client-core';
import { SyncConflict, SyncParkedChange } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { errorStatus } from '../client/core-requests';

/** A field that differs between the two versions of a row. */
interface Difference {
  field: string;
  kept: unknown;
  current: unknown;
}

/**
 * What sync set aside (docs/sync.md, "Conflicts"): a version that lost to a newer change, side
 * by side with the row as it is now — keep either one. And changes that could not be applied.
 */
@Component({
  selector: 'pd-sync-conflicts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, JsonPipe, MatButtonModule, MatIconModule, TranslocoPipe],
  template: `
    @if (conflicts().length) {
      <div class="head">
        <h3>{{ 'core.settings.sync.conflictsTitle' | transloco }}</h3>
        <button matButton (click)="dismissAll()" [disabled]="busy()">
          {{ 'core.settings.sync.dismissAll' | transloco }}
        </button>
      </div>
      @for (conflict of conflicts(); track conflict.id) {
        <div class="item">
          <div class="meta">
            <strong>{{ tableName(conflict.table) }}</strong>
            · {{ conflict.createdAt | date: 'd MMM, HH:mm' }} · {{ reason(conflict.reason) }}
          </div>
          <div class="versions">
            <div class="version">
              <span class="label">{{ 'core.settings.sync.keptVersion' | transloco }}</span>
              @for (diff of differences(conflict); track diff.field) {
                <div class="field">
                  <span class="name">{{ diff.field }}</span>
                  <span class="value">{{ show(diff.kept) }}</span>
                </div>
              }
              <button matButton="tonal" (click)="keep(conflict)" [disabled]="busy()">
                {{ 'core.settings.sync.keepThis' | transloco }}
              </button>
            </div>
            <div class="version">
              <span class="label">{{ 'core.settings.sync.currentVersion' | transloco }}</span>
              @if (conflict.current) {
                @for (diff of differences(conflict); track diff.field) {
                  <div class="field">
                    <span class="name">{{ diff.field }}</span>
                    <span class="value">{{ show(diff.current) }}</span>
                  </div>
                }
              } @else {
                <p class="hint">{{ 'core.settings.sync.noCurrent' | transloco }}</p>
              }
              <button matButton (click)="dismiss(conflict)" [disabled]="busy()">
                {{ 'core.settings.sync.keepCurrent' | transloco }}
              </button>
            </div>
          </div>
        </div>
      }
    }

    @if (parked().length) {
      <h3>{{ 'core.settings.sync.parkedTitle' | transloco }}</h3>
      @for (change of parked(); track change.table + change.pk) {
        <div class="item parked">
          <div class="body">
            <div class="meta">
              <strong>{{ tableName(change.table) }}</strong>
              · {{ change.parkedAt | date: 'd MMM, HH:mm' }}
              @if (!change.row) {
                · {{ 'core.settings.sync.deletion' | transloco }}
              }
            </div>
            <code>{{ change.pk }}</code>
            <p class="error">{{ change.error }}</p>
            @if (change.row) {
              <details>
                <summary>{{ 'core.settings.sync.showRow' | transloco }}</summary>
                <pre>{{ change.row | json }}</pre>
              </details>
            }
          </div>
          <button matButton (click)="discard(change)" [disabled]="busy()">
            {{ 'core.settings.sync.discard' | transloco }}
          </button>
        </div>
      }
    }

    @if (!conflicts().length && !parked().length) {
      <p class="hint">{{ 'core.settings.sync.nothingSetAside' | transloco }}</p>
    }
  `,
  styles: `
    h3 {
      margin: 16px 0 8px;
      font: var(--mat-sys-title-small);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .item {
      padding: 8px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .parked {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .meta,
    .hint,
    .label {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .versions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      margin-top: 8px;
    }
    .version {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 8px;
      border: 1px solid var(--pd-border);
      border-radius: 8px;
      min-width: 0;
    }
    .field {
      display: flex;
      flex-direction: column;
      width: 100%;
    }
    .name {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .error {
      margin: 4px 0;
      color: var(--mat-sys-error);
      overflow-wrap: anywhere;
    }
    code,
    pre {
      font-size: 12px;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
  `,
})
export class SyncConflictsComponent {
  private readonly sync = syncApi(inject(DASHBOARD_CLIENT).api);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  /** Something was kept or dismissed: the counts in the status changed. */
  readonly changed = output<void>();

  protected readonly conflicts = signal<SyncConflict[]>([]);
  protected readonly parked = signal<SyncParkedChange[]>([]);
  protected readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  /** Only the fields that differ; with no current row, every field of the kept one. */
  protected differences(conflict: SyncConflict): Difference[] {
    const current = conflict.current ?? {};
    const fields = [...new Set([...Object.keys(conflict.kept), ...Object.keys(current)])];
    return fields
      .filter(
        (field) =>
          !conflict.current ||
          JSON.stringify(conflict.kept[field]) !== JSON.stringify(current[field]),
      )
      .map((field) => ({ field, kept: conflict.kept[field], current: current[field] }));
  }

  protected show(value: unknown): string {
    if (value === null || value === undefined) {
      return '—';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  /** A known table by its name (the trash has them all), any other as it is. */
  protected tableName(table: string): string {
    const key = `core.settings.trash.tables.${table}`;
    const name = this.transloco.translate(key);
    return name === key ? table : name;
  }

  /** The reasons sync writes (sync-store.ts), in the user's language. */
  protected reason(reason: string): string {
    const key = `core.settings.sync.reasons.${reason.replace(/ /g, '_')}`;
    const text = this.transloco.translate(key);
    return text === key ? reason : text;
  }

  protected keep(conflict: SyncConflict): Promise<void> {
    return this.run(() => this.sync.keepConflict(conflict.id), 'core.settings.sync.kept');
  }

  protected dismiss(conflict: SyncConflict): Promise<void> {
    return this.run(() => this.sync.dismissConflict(conflict.id));
  }

  protected dismissAll(): Promise<void> {
    if (!confirm(this.transloco.translate('core.settings.sync.confirmDismissAll'))) {
      return Promise.resolve();
    }
    return this.run(() => this.sync.dismissAllConflicts());
  }

  protected discard(change: SyncParkedChange): Promise<void> {
    return this.run(() => this.sync.discardParked({ table: change.table, pk: change.pk }));
  }

  private async load(): Promise<void> {
    const [conflicts, parked] = await Promise.all([this.sync.conflicts(), this.sync.parked()]);
    this.conflicts.set(conflicts);
    this.parked.set(parked);
  }

  private async run(step: () => Promise<void>, done?: string): Promise<void> {
    this.busy.set(true);
    try {
      await step();
      if (done) {
        this.notify(done);
      }
    } catch (error) {
      this.notify(
        errorStatus(error) === 409 ? 'core.settings.sync.parentGone' : 'core.login.error',
      );
    } finally {
      this.busy.set(false);
      await this.load();
      this.changed.emit();
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 4000 });
  }
}
