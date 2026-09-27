import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { MonitorStatus } from '@pd/contracts';

const ICONS: Record<MonitorStatus, string> = {
  up: 'check_circle',
  down: 'error',
  pending: 'schedule',
};

/** Monitor status: icon + text (not color alone). */
@Component({
  selector: 'pd-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, TranslocoPipe],
  template: `
    <span class="badge" [class]="status()">
      <mat-icon inline>{{ icon() }}</mat-icon>
      {{ 'monitoring.status.' + status() | transloco }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 12px;
      font: var(--mat-sys-label-large);
      white-space: nowrap;
    }
    .up {
      background: light-dark(#e6f4ea, #1e3a26);
      color: light-dark(#1e6b34, #8fd6a0);
    }
    .down {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
    .pending {
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<MonitorStatus>();
  protected readonly icon = computed(() => ICONS[this.status()]);
}
