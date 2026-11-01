import {DatePipe, DecimalPipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, input} from '@angular/core';
import {MatCardModule} from '@angular/material/card';
import {TranslocoPipe} from '@jsverse/transloco';
import {SystemMetrics} from '@pd/contracts';

/**
 * The instance's numbers (Settings → System): requests and job runs of this process, memory, the
 * AI's usage today, the notifications' delivery and sync — what a `/metrics` endpoint would give,
 * read on the page instead of in Grafana.
 */
@Component({
  selector: 'pd-system-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatCardModule, TranslocoPipe],
  template: `
    @let m = metrics();
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title
          >📈
          {{ 'core.settings.system.metrics.title' | transloco }}</mat-card-title
        >
        <mat-card-subtitle>
          {{
            'core.settings.system.metrics.since'
              | transloco: {time: m.since | date: 'd MMM, HH:mm'}
          }}
        </mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <dl>
          <div [class.bad]="m.requests.serverErrors > 0">
            <dt>{{ 'core.settings.system.metrics.requests' | transloco }}</dt>
            <dd>
              {{ m.requests.total | number }}
              @if (m.requests.serverErrors) {
                ·
                {{
                  'core.settings.system.metrics.serverErrors'
                    | transloco: {count: m.requests.serverErrors}
                }}
              }
              @if (m.requests.p95Ms !== null) {
                ·
                {{
                  'core.settings.system.metrics.p95'
                    | transloco: {value: m.requests.p95Ms | number}
                }}
              }
            </dd>
          </div>
          <div [class.bad]="m.jobs.failures > 0">
            <dt>{{ 'core.settings.system.metrics.jobs' | transloco }}</dt>
            <dd>
              {{ m.jobs.runs | number }}
              @if (m.jobs.failures) {
                ·
                {{
                  'core.settings.system.metrics.failures'
                    | transloco: {count: m.jobs.failures}
                }}
              }
            </dd>
          </div>
          <div>
            <dt>{{ 'core.settings.system.metrics.memory' | transloco }}</dt>
            <dd>
              {{
                'core.settings.system.metrics.memoryValue'
                  | transloco: {value: m.memoryMb | number}
              }}
            </dd>
          </div>
          <div>
            <dt>{{ 'core.settings.system.metrics.ai' | transloco }}</dt>
            <dd>
              {{
                'core.settings.system.metrics.aiValue'
                  | transloco
                    : {
                        requests: m.ai.requests,
                        tokens:
                          (m.ai.promptTokens + m.ai.completionTokens | number),
                      }
              }}
            </dd>
          </div>
          <div [class.bad]="m.notifications.failed > 0">
            <dt>
              {{ 'core.settings.system.metrics.notifications' | transloco }}
            </dt>
            <dd>
              {{
                'core.settings.system.metrics.notificationsValue'
                  | transloco: m.notifications
              }}
            </dd>
          </div>
          @if (m.sync; as sync) {
            <div [class.bad]="sync.parked > 0">
              <dt>{{ 'core.settings.system.metrics.sync' | transloco }}</dt>
              <dd>
                {{
                  'core.settings.system.metrics.syncValue'
                    | transloco
                      : {
                          time: sync.lastAt
                            ? (sync.lastAt | date: 'd MMM, HH:mm')
                            : '—',
                          pending: sync.pending,
                          parked: sync.parked,
                        }
                }}
              </dd>
            </div>
          }
        </dl>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    dl {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px 24px;
      margin: 0;
    }
    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 2px 0 0;
      font: var(--mat-sys-body-large);
      overflow-wrap: anywhere;
    }
    .bad dd {
      color: var(--mat-sys-error);
    }
  `,
})
export class SystemMetricsComponent {
  readonly metrics = input.required<SystemMetrics>();
}
