import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { trashApi } from '@pd/client-core';
import { TrashItem } from '@pd/contracts';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';
import { errorStatus } from '../client/core-requests';

/**
 * The trash: what was deleted in the last 30 days — by hand or by the AI assistant — with a way
 * back. Deleting a project here also shows what went with it.
 */
@Component({
  selector: 'pd-trash-settings',
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
        <mat-card-title>🗑️ {{ 'core.settings.trash.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.trash.subtitle' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @for (item of items(); track item.id) {
          <div class="item">
            <span class="body">
              <span class="what">
                {{ tableName(item.table) }}
                @if (item.label) {
                  — {{ item.label }}
                }
              </span>
              <span class="meta">
                {{ item.deletedAt | date: 'd MMM, HH:mm' }}
                @if (item.rows > 1) {
                  · {{ describe(item) }}
                }
              </span>
            </span>
            <button matButton (click)="restore(item)" [disabled]="busy()">
              <mat-icon>restore_from_trash</mat-icon>
              {{ 'core.settings.trash.restore' | transloco }}
            </button>
            <button
              matIconButton
              [matTooltip]="'core.settings.trash.forever' | transloco"
              [attr.aria-label]="'core.settings.trash.forever' | transloco"
              (click)="remove(item)"
              [disabled]="busy()"
            >
              <mat-icon>delete_forever</mat-icon>
            </button>
          </div>
        } @empty {
          <p class="empty">{{ 'core.settings.trash.empty' | transloco }}</p>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .what {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta,
    .empty {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TrashSettingsComponent {
  private readonly trash = trashApi(inject(DASHBOARD_CLIENT).api);
  private readonly transloco = inject(TranslocoService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly items = signal<TrashItem[]>([]);
  protected readonly busy = signal(false);

  constructor() {
    void this.load();
  }

  /** A known table by its name ("Transaction"), any other as it is. */
  protected tableName(table: string): string {
    const key = `core.settings.trash.tables.${table}`;
    const name = this.transloco.translate(key);
    return name === key ? table : name;
  }

  /** "12 rows: 1 account, 11 matches". */
  protected describe(item: TrashItem): string {
    const parts = item.parts.map((part) => `${part.count} × ${this.tableName(part.table)}`);
    return this.transloco.translate('core.settings.trash.rows', { parts: parts.join(', ') });
  }

  protected async restore(item: TrashItem): Promise<void> {
    await this.run(async () => {
      await this.trash.restore(item.id);
      this.notify('core.settings.trash.restored');
    });
  }

  protected async remove(item: TrashItem): Promise<void> {
    if (confirm(this.transloco.translate('core.settings.trash.confirmForever'))) {
      await this.run(() => this.trash.remove(item.id));
    }
  }

  private async load(): Promise<void> {
    this.items.set(await this.trash.list());
  }

  private async run(step: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await step();
    } catch (error) {
      this.notify(
        errorStatus(error) === 409 ? 'core.settings.trash.parentFirst' : 'core.login.error',
      );
    } finally {
      this.busy.set(false);
      await this.load();
    }
  }

  private notify(key: string): void {
    this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 4000 });
  }
}
