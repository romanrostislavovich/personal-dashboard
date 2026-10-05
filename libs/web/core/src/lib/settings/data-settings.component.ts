import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { dataApi } from '@pd/client-core';
import { DataImportReport } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { errorStatus } from '../client/core-requests';

/**
 * One's data as a file: everything is exported as one ZIP, and an archive is brought back — into
 * this account or another dashboard. An import first shows what it would add; only what is
 * missing is added, nothing is replaced or deleted.
 */
@Component({
  selector: 'pd-data-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>📦 {{ 'core.settings.data.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.data.subtitle' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <p class="hint">{{ 'core.settings.data.exportHint' | transloco }}</p>
        <div class="actions">
          <button matButton="filled" (click)="export()" [disabled]="busy() !== null">
            <mat-icon>download</mat-icon> {{ 'core.settings.data.export' | transloco }}
          </button>
          <button matButton="outlined" (click)="file.click()" [disabled]="busy() !== null">
            <mat-icon>upload</mat-icon> {{ 'core.settings.data.import' | transloco }}
          </button>
          <input #file type="file" accept=".zip,application/zip" hidden (change)="pick(file)" />
        </div>
        @if (busy(); as step) {
          <p class="hint">{{ 'core.settings.data.' + step | transloco }}</p>
          <mat-progress-bar mode="indeterminate" />
        }

        @if (report(); as r) {
          <div class="report">
            <p>
              {{
                (applied() ? 'core.settings.data.applied' : 'core.settings.data.preview')
                  | transloco
                    : {
                        added: added(),
                        existing: existing(),
                        date: (r.exportedAt | date: 'd MMM y, HH:mm'),
                      }
              }}
            </p>
            <ul>
              @for (table of changed(); track table.table) {
                <li>
                  <span>{{ tableName(table.table) }}</span>
                  <span class="count">+{{ table.added }}</span>
                </li>
              }
            </ul>
            @if (r.unknownTables.length) {
              <p class="hint">
                {{
                  'core.settings.data.unknown' | transloco: { tables: r.unknownTables.join(', ') }
                }}
              </p>
            }
            @if (!applied()) {
              <div class="actions">
                <button
                  matButton="filled"
                  (click)="apply(r)"
                  [disabled]="busy() !== null || added() === 0"
                >
                  {{ 'core.settings.data.apply' | transloco }}
                </button>
                <button matButton (click)="cancel(r)" [disabled]="busy() !== null">
                  {{ 'core.actions.cancel' | transloco }}
                </button>
              </div>
            }
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .report {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--pd-border);
    }
    ul {
      margin: 8px 0;
      padding: 0;
      list-style: none;
      max-height: 240px;
      overflow: auto;
    }
    li {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0;
      font: var(--mat-sys-body-small);
    }
    .count {
      color: var(--mat-sys-primary);
    }
  `,
})
export class DataSettingsComponent {
  private readonly data = dataApi(inject(DASHBOARD_CLIENT).api);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  /** What is going on: the key of its text (`exporting`, `reading`, `importing`). */
  protected readonly busy = signal<'exporting' | 'reading' | 'importing' | null>(null);
  /** The uploaded archive: what it would add, or — once applied — what it added. */
  protected readonly report = signal<DataImportReport | null>(null);
  protected readonly applied = signal(false);

  protected readonly changed = computed(() =>
    (this.report()?.tables ?? []).filter((table) => table.added > 0),
  );
  protected readonly added = computed(() =>
    (this.report()?.tables ?? []).reduce((total, table) => total + table.added, 0),
  );
  protected readonly existing = computed(
    () =>
      (this.report()?.tables ?? []).reduce((total, table) => total + table.inArchive, 0) -
      this.added(),
  );

  /** A known table by its name ("Transaction", as the trash calls it), any other as it is. */
  protected tableName(table: string): string {
    const key = `core.settings.trash.tables.${table}`;
    const name = this.transloco.translate(key);
    return name === key ? table : name;
  }

  protected async export(): Promise<void> {
    await this.run('exporting', async () => {
      const url = URL.createObjectURL(await this.data.export());
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  protected async pick(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // The same file may be picked again.
    if (!file) {
      return;
    }
    const previous = this.report();
    if (previous && !this.applied()) {
      await this.data.discardImport(previous.id).catch(() => undefined);
    }
    this.report.set(null);
    this.applied.set(false);
    await this.run('reading', async () => this.report.set(await this.data.previewImport(file)));
  }

  protected async apply(report: DataImportReport): Promise<void> {
    await this.run('importing', async () => {
      this.report.set(await this.data.applyImport(report.id));
      this.applied.set(true);
    });
  }

  protected async cancel(report: DataImportReport): Promise<void> {
    this.report.set(null);
    await this.data.discardImport(report.id).catch(() => undefined);
  }

  private async run(step: 'exporting' | 'reading' | 'importing', work: () => Promise<void>) {
    this.busy.set(step);
    try {
      await work();
    } catch (error) {
      const status = errorStatus(error);
      const key =
        status === 400
          ? 'core.settings.data.notArchive'
          : status === 409
            ? 'core.settings.data.otherAccount'
            : status === 404
              ? 'core.settings.data.gone'
              : 'core.settings.data.failed';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 8000 });
    } finally {
      this.busy.set(null);
    }
  }
}
