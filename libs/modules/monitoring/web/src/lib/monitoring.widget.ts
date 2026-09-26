import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectsApi } from '@pd/web-core';
import { MonitoringApi } from './monitoring.api';
import { StatusBadgeComponent } from './status-badge.component';

/** Виджет главной: статус всех мониторов; упавшие — первыми. */
@Component({
  selector: 'pd-monitoring-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    TranslocoPipe,
    StatusBadgeComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>📡 {{ 'monitoring.widget.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @for (monitor of sorted(); track monitor.id) {
          <div class="row">
            <div class="name">
              <span>{{ projectNames().get(monitor.projectId) }}</span>
              <small>{{ host(monitor.url) }}</small>
            </div>
            <span class="uptime">
              {{
                monitor.uptime.week === null ? '—' : (monitor.uptime.week | number: '1.0-2') + '%'
              }}
            </span>
            <pd-status-badge [status]="monitor.status" />
          </div>
        } @empty {
          <p class="empty">{{ 'monitoring.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/monitoring">{{ 'monitoring.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .row:first-child {
      border-top: 0;
    }
    .name {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .name small {
      color: var(--mat-sys-on-surface-variant);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .uptime {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class MonitoringWidget {
  private readonly monitors = inject(MonitoringApi).monitors();
  private readonly projects = inject(ProjectsApi).list();

  protected readonly projectNames = computed(
    () => new Map(this.projects.value().map((project) => [project.id, project.name])),
  );

  private readonly statusOrder = { down: 0, pending: 1, up: 2 } as const;
  protected readonly sorted = computed(() =>
    [...this.monitors.value()].sort(
      (a, b) => this.statusOrder[a.status] - this.statusOrder[b.status],
    ),
  );

  protected host(url: string): string {
    return new URL(url).host;
  }
}
