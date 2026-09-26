import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { Monitor } from '@pd/contracts';
import { SparklineComponent } from '@pd/web-core';
import { StatusBadgeComponent } from './status-badge.component';

const DAY_MS = 24 * 60 * 60 * 1000;
/** За сколько дней до истечения SSL подсвечивать предупреждение. */
const SSL_WARNING_DAYS = 14;

@Component({
  selector: 'pd-monitor-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoPipe,
    SparklineComponent,
    StatusBadgeComponent,
  ],
  template: `
    @let m = monitor();
    <mat-card appearance="outlined" [class.is-down]="m.status === 'down'">
      <mat-card-header>
        <mat-card-title>{{ projectName() }}</mat-card-title>
        <mat-card-subtitle>
          <a [href]="m.url" target="_blank" rel="noopener">{{ m.url }}</a>
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <div class="status-row">
          <pd-status-badge [status]="m.status" />
          @if (m.status === 'down' && m.downSince) {
            <span class="since">
              {{ 'monitoring.downSince' | transloco }} {{ m.downSince | date: 'd MMM, HH:mm' }}
            </span>
          }
          @if (m.lastError) {
            <span class="error">{{ m.lastError }}</span>
          }
        </div>

        <div class="stats">
          <div class="stat">
            <span class="label">{{ 'monitoring.uptime24h' | transloco }}</span>
            <span class="value">{{
              m.uptime.day === null ? '—' : (m.uptime.day | number: '1.0-2') + '%'
            }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ 'monitoring.uptime7d' | transloco }}</span>
            <span class="value">{{
              m.uptime.week === null ? '—' : (m.uptime.week | number: '1.0-2') + '%'
            }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ 'monitoring.uptime30d' | transloco }}</span>
            <span class="value">{{
              m.uptime.month === null ? '—' : (m.uptime.month | number: '1.0-2') + '%'
            }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ 'monitoring.response' | transloco }}</span>
            <span class="value">
              {{ m.lastResponseMs === null ? '—' : (m.lastResponseMs | number) + ' ' }}
              @if (m.lastResponseMs !== null) {
                <small>{{ 'monitoring.ms' | transloco }}</small>
              }
            </span>
          </div>
        </div>

        <div class="chart">
          <span class="label">{{ 'monitoring.responseChart' | transloco }}</span>
          @if (responsePoints().length > 1) {
            <pd-sparkline
              [points]="responsePoints()"
              dateFormat="HH:mm"
              [unit]="' ' + ('monitoring.ms' | transloco)"
              [label]="'monitoring.responseChart' | transloco"
            />
          } @else {
            <p class="hint">{{ 'monitoring.chartCollecting' | transloco }}</p>
          }
        </div>

        <p class="meta">
          @let days = sslDaysLeft();
          <!-- Сравниваем с null явно: 0 дней — тоже важная информация. -->
          @if (days !== null) {
            <span [class.warning]="days <= sslWarningDays">
              🔒 {{ 'monitoring.sslExpires' | transloco: { days } }}
            </span>
          }
          @if (m.lastCheckedAt) {
            <span
              >{{ 'monitoring.lastCheck' | transloco }} {{ m.lastCheckedAt | date: 'HH:mm' }}</span
            >
          }
        </p>
      </mat-card-content>

      <mat-card-actions align="end">
        <button
          matIconButton
          [matTooltip]="'core.actions.delete' | transloco"
          (click)="remove.emit(m)"
        >
          <mat-icon>delete</mat-icon>
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .is-down {
      border-color: var(--mat-sys-error);
    }
    .status-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
    }
    .since,
    .hint,
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: 12px;
      margin: 16px 0 8px;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-title-large);
    }
    .value small {
      font: var(--mat-sys-label-medium);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin: 8px 0 0;
    }
    .warning {
      color: var(--mat-sys-error);
    }
  `,
})
export class MonitorCardComponent {
  readonly monitor = input.required<Monitor>();
  readonly projectName = input.required<string>();
  readonly remove = output<Monitor>();

  protected readonly sslWarningDays = SSL_WARNING_DAYS;

  protected readonly responsePoints = computed(() =>
    this.monitor().responseTimes.map((point) => ({ at: point.at, value: point.avgMs })),
  );

  protected readonly sslDaysLeft = computed(() => {
    const expiresAt = this.monitor().sslExpiresAt;
    return expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / DAY_MS) : null;
  });
}
