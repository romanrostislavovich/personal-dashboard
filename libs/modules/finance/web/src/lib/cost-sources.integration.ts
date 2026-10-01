import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CostSource, CostSourceInput } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { IntegrationGuideComponent, ProjectsApi, errorStatus } from '@pd/web-core';
import { CostSourceFormData, CostSourceFormDialog } from './cost-source-form.dialog';
import { FinanceApi } from './finance.api';

/**
 * Cost import from services (Hetzner, DeepSeek…) with their costs for the current month, in
 * Settings → Integrations (see `integrations` in finance.module.ts).
 */
@Component({
  selector: 'pd-cost-sources-integration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DatePipe,
    MatCardModule,
    IntegrationGuideComponent,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>cloud_sync</mat-icon>
        <mat-card-title>{{ 'finance.costSources.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'finance.costSources.hint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-list>
        @for (source of sources.value(); track source.id) {
          <mat-list-item>
            <mat-icon matListItemIcon>{{
              source.lastError ? 'sync_problem' : 'cloud_sync'
            }}</mat-icon>
            <span matListItemTitle>{{ source.name }}</span>
            <span matListItemLine>
              {{ 'finance.costSources.providers.' + source.provider + '.title' | transloco }} ·
              {{
                source.projectId
                  ? projectNames().get(source.projectId)
                  : ('finance.scope.personal' | transloco)
              }}
              @if (source.lastSyncedAt) {
                · {{ 'finance.costSources.synced' | transloco }}
                {{ source.lastSyncedAt | date: 'd MMM, HH:mm' }}
              }
            </span>
            @if (source.lastError) {
              <span matListItemLine class="error">{{ source.lastError }}</span>
            }
            <div matListItemMeta class="meta">
              <span class="amount">
                @if (source.currentMonth) {
                  {{ source.currentMonth.amount | currency: source.currentMonth.currency }}
                } @else {
                  —
                }
              </span>
              <button
                matIconButton
                [matTooltip]="'finance.costSources.syncNow' | transloco"
                [disabled]="busy()"
                (click)="sync(source)"
              >
                <mat-icon>sync</mat-icon>
              </button>
              <button
                matIconButton
                [matTooltip]="'core.actions.delete' | transloco"
                (click)="remove(source)"
              >
                <mat-icon>link_off</mat-icon>
              </button>
            </div>
          </mat-list-item>
        } @empty {
          <p class="empty padded">{{ 'finance.costSources.empty' | transloco }}</p>
        }
      </mat-list>
      <div class="guides">
        <pd-integration-guide
          guide="finance.costSources.guide.hetzner"
          [steps]="3"
          link="https://console.hetzner.cloud"
          title="Hetzner Cloud"
        />
        <pd-integration-guide
          guide="finance.costSources.guide.deepseek"
          [steps]="3"
          link="https://platform.deepseek.com/api_keys"
          title="DeepSeek"
        />
      </div>
      <mat-card-actions>
        <button matButton="filled" (click)="add()" [disabled]="busy()">
          <mat-icon>add_link</mat-icon> {{ 'finance.costSources.add' | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .guides {
      padding: 0 16px;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .amount {
      font: var(--mat-sys-title-small);
      margin-right: 8px;
      white-space: nowrap;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .padded {
      padding: 16px;
    }
  `,
})
export class CostSourcesIntegration {
  private readonly api = inject(FinanceApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly sources = this.api.costSources();
  protected readonly busy = signal(false);
  private readonly projects = inject(ProjectsApi).list();
  protected readonly projectNames = computed(
    () => new Map(this.projects.value().map((project) => [project.id, project.name])),
  );

  async add(): Promise<void> {
    const input = await firstValueFrom(
      this.dialog
        .open<CostSourceFormDialog, CostSourceFormData, CostSourceInput>(CostSourceFormDialog, {
          data: { projects: this.projects.value(), defaultProjectId: null },
        })
        .afterClosed(),
    );
    if (input) {
      await this.run(() => firstValueFrom(this.api.addCostSource(input)));
    }
  }

  async sync(source: CostSource): Promise<void> {
    await this.run(() => firstValueFrom(this.api.syncCostSource(source.id)));
  }

  async remove(source: CostSource): Promise<void> {
    if (
      confirm(this.transloco.translate('finance.costSources.confirmDelete', { name: source.name }))
    ) {
      await this.run(() => firstValueFrom(this.api.removeCostSource(source.id)));
    }
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      this.sources.reload();
    } catch (error) {
      const key =
        errorStatus(error) === 400
          ? 'finance.costSources.invalidToken'
          : 'finance.costSources.error';
      this.snackBar.open(this.transloco.translate(key), 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }
}
