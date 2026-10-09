import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { IntegrationState, IntegrationStatus } from '@pd/contracts';

const ICONS: Record<IntegrationState, string> = {
  ok: 'check_circle',
  error: 'error',
  stale: 'schedule',
  expiring: 'key',
  expired: 'key_off',
};

/**
 * Every connection to an outside service in one list: when it last refreshed, what went wrong,
 * which token expires soon. The cards below it are where a connection is set up or renewed.
 */
@Component({
  selector: 'pd-integration-status',
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
    @if (statuses.value().length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>hub</mat-icon>
          <mat-card-title>{{ 'core.integrations.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>
            @if (troubled()) {
              {{ 'core.integrations.troubled' | transloco: { count: troubled() } }}
            } @else {
              {{ 'core.integrations.allFine' | transloco }}
            }
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @for (status of statuses.value(); track status.id) {
            <div class="row" [class]="status.state">
              <mat-icon [matTooltip]="'core.integrations.states.' + status.state | transloco">
                {{ icons[status.state] }}
              </mat-icon>
              <span class="what">
                <span>
                  <b>{{ status.name }}</b>
                  @if (status.detail) {
                    <span class="hint"> · {{ status.detail }}</span>
                  }
                </span>
                @if (status.state !== 'ok') {
                  <span class="trouble">
                    {{ 'core.integrations.states.' + status.state | transloco }}
                    @if (status.error && status.state === 'error') {
                      — {{ status.error }}
                    }
                  </span>
                }
                @if (status.expiresAt) {
                  <span class="hint">
                    {{
                      'core.integrations.expires'
                        | transloco: { date: (status.expiresAt | date: 'd MMM y') }
                    }}
                  </span>
                }
              </span>
              <span class="hint when">
                @if (status.lastSyncedAt) {
                  {{ status.lastSyncedAt | date: 'd MMM, HH:mm' }}
                }
              </span>
            </div>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <button matButton (click)="statuses.reload()">
            <mat-icon>refresh</mat-icon> {{ 'core.integrations.refresh' | transloco }}
          </button>
        </mat-card-actions>
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 16px;
    }
    .row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--pd-border);
    }
    .row mat-icon {
      color: var(--pd-success);
    }
    .row.error mat-icon,
    .row.expired mat-icon {
      color: var(--mat-sys-error);
    }
    .row.stale mat-icon,
    .row.expiring mat-icon {
      color: var(--mat-sys-tertiary);
    }
    .what {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .hint,
    .trouble {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .error .trouble,
    .expired .trouble {
      color: var(--mat-sys-error);
    }
    .when {
      white-space: nowrap;
    }
  `,
})
export class IntegrationStatusComponent {
  protected readonly icons = ICONS;
  protected readonly statuses = httpResource<IntegrationStatus[]>(() => CORE_READS.integrations(), {
    defaultValue: [],
  });
  protected readonly troubled = computed(
    () => this.statuses.value().filter((status) => status.state !== 'ok').length,
  );
}
