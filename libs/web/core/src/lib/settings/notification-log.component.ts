import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import {
  NOTIFICATION_DELIVERY_STATUSES,
  NotificationDeliveryStatus,
  NotificationLog,
} from '@pd/contracts';

const STATUS_ICONS: Record<NotificationDeliveryStatus, string> = {
  sending: 'schedule_send',
  pending: 'schedule',
  sent: 'check_circle',
  failed: 'error',
  deduplicated: 'filter_none',
};

/** What became of the latest notifications: sent, tried again, failed, sent once. */
@Component({
  selector: 'pd-notification-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar>outbox</mat-icon>
        <mat-card-title>{{ 'core.settings.deliveries.title' | transloco }}</mat-card-title>
        <mat-card-subtitle>{{ 'core.settings.deliveries.hint' | transloco }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (log.value(); as current) {
          <p class="week">
            {{ 'core.settings.deliveries.week' | transloco }}:
            @for (status of statuses; track status) {
              @if (current.week[status]) {
                <span [class]="status">
                  {{ 'core.settings.deliveries.statuses.' + status | transloco }}
                  {{ current.week[status] }}
                </span>
              }
            }
          </p>
          <ul>
            @for (item of current.items; track item.id) {
              <li [class]="item.status">
                <mat-icon
                  [attr.aria-label]="'core.settings.deliveries.statuses.' + item.status | transloco"
                >
                  {{ icons[item.status] }}
                </mat-icon>
                <span class="body">
                  <span class="title">{{ item.title }}</span>
                  <span class="meta">
                    {{ item.createdAt | date: 'd MMM, HH:mm' }} · {{ item.source }} ·
                    {{ 'core.settings.deliveries.statuses.' + item.status | transloco }}
                    @if (item.attempts > 0) {
                      ·
                      {{
                        'core.settings.deliveries.attempts' | transloco: { count: item.attempts }
                      }}
                    }
                    @if (item.nextAttemptAt) {
                      ·
                      {{
                        'core.settings.deliveries.nextAt'
                          | transloco: { at: (item.nextAttemptAt | date: 'HH:mm') }
                      }}
                    }
                  </span>
                  @if (item.lastError) {
                    <span class="error">{{ item.lastError }}</span>
                  }
                </span>
              </li>
            } @empty {
              <li class="hint">{{ 'core.settings.deliveries.empty' | transloco }}</li>
            }
          </ul>
        }
      </mat-card-content>
      <mat-card-actions>
        <button matButton (click)="log.reload()">
          <mat-icon>refresh</mat-icon> {{ 'core.settings.system.refresh' | transloco }}
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .week {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      color: var(--mat-sys-on-surface-variant);
    }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 420px;
      overflow-y: auto;
    }
    li {
      display: flex;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .sent mat-icon {
      color: var(--mat-sys-primary);
    }
    .failed mat-icon,
    span.failed {
      color: var(--mat-sys-error);
    }
    .pending mat-icon,
    .sending mat-icon,
    .deduplicated mat-icon {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class NotificationLogComponent {
  protected readonly log = httpResource<NotificationLog>(() => CORE_READS.notificationLog());
  protected readonly statuses = NOTIFICATION_DELIVERY_STATUSES;
  protected readonly icons = STATUS_ICONS;
}
