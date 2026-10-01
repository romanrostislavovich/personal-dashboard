import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_READS, systemApi } from '@pd/client-core';
import { SystemJob, SystemLogLevel, SystemStatus } from '@pd/contracts';
import { errorStatus } from '../client/core-requests';
import { DASHBOARD_CLIENT } from '../client/dashboard-client';

type LevelFilter = SystemLogLevel | 'all';

/**
 * How the instance is doing: background jobs with their last runs and the log of errors and
 * warnings — what used to be visible only in `docker compose logs`. Only the owner sees it.
 */
@Component({
  selector: 'pd-system-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    @if (forbidden()) {
      <p class="hint">{{ 'core.settings.system.ownerOnly' | transloco }}</p>
    } @else if (status.value(); as s) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>⚙️ {{ 'core.settings.system.jobs' | transloco }}</mat-card-title>
          <mat-card-subtitle>
            {{
              (s.jobsRunHere
                ? 'core.settings.system.jobsHint'
                : 'core.settings.system.jobsOnServer'
              ) | transloco
            }}
          </mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @for (job of s.jobs; track job.name) {
            <div class="job" [class.failed]="job.failures > 0">
              <mat-icon class="state">{{ job.failures > 0 ? 'error' : 'check_circle' }}</mat-icon>
              <span class="body">
                <span class="name">{{ job.name }}</span>
                <span class="meta">
                  <code>{{ job.cron }}</code>
                  @if (lastRun(job); as at) {
                    · {{ at | date: 'd MMM, HH:mm' }}
                  }
                  @if (job.lastDurationMs !== null) {
                    · {{ seconds(job.lastDurationMs) }}
                    {{ 'core.settings.system.seconds' | transloco }}
                  }
                </span>
                @if (job.failures > 0) {
                  <span class="problem">
                    {{ 'core.settings.system.failedRuns' | transloco: { count: job.failures } }}:
                    {{ job.lastError }}
                  </span>
                }
              </span>
            </div>
          } @empty {
            <p class="hint">{{ 'core.settings.system.noJobs' | transloco }}</p>
          }
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-card-title>🧾 {{ 'core.settings.system.log' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'core.settings.system.logHint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="toolbar">
            <mat-button-toggle-group
              hideSingleSelectionIndicator
              [value]="level()"
              (change)="level.set($event.value)"
            >
              <mat-button-toggle value="all">
                {{ 'core.settings.system.levels.all' | transloco }}
              </mat-button-toggle>
              <mat-button-toggle value="error">
                {{ 'core.settings.system.levels.error' | transloco }} · {{ count('error') }}
              </mat-button-toggle>
              <mat-button-toggle value="warn">
                {{ 'core.settings.system.levels.warn' | transloco }} · {{ count('warn') }}
              </mat-button-toggle>
            </mat-button-toggle-group>
            <span class="spacer"></span>
            <button matButton (click)="status.reload()">
              <mat-icon>refresh</mat-icon> {{ 'core.settings.system.refresh' | transloco }}
            </button>
            <button matButton [disabled]="!s.log.length" (click)="clear()">
              <mat-icon>delete_sweep</mat-icon> {{ 'core.settings.system.clear' | transloco }}
            </button>
          </div>

          @for (entry of entries(); track entry.id) {
            <details class="entry" [class.error]="entry.level === 'error'">
              <summary>
                <span class="when">{{ entry.lastAt | date: 'd MMM, HH:mm' }}</span>
                <span class="source">{{ entry.source }}</span>
                @if (entry.count > 1) {
                  <span class="times">×{{ entry.count }}</span>
                }
                <span class="message">{{ entry.message }}</span>
              </summary>
              <div class="more">
                @if (entry.count > 1) {
                  <p>
                    {{ 'core.settings.system.since' | transloco }}
                    {{ entry.firstAt | date: 'd MMM, HH:mm' }}
                  </p>
                }
                <pre>{{ entry.details || entry.message }}</pre>
              </div>
            </details>
          } @empty {
            <p class="hint">{{ 'core.settings.system.logEmpty' | transloco }}</p>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .job {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--pd-border);
    }
    .state {
      color: var(--pd-success);
    }
    .failed .state,
    .problem {
      color: var(--mat-sys-error);
    }
    .body {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-weight: 600;
    }
    .meta,
    .problem {
      font: var(--mat-sys-body-small);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
    }
    .problem {
      overflow-wrap: anywhere;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 8px 0 12px;
    }
    .spacer {
      flex: 1;
    }
    .entry {
      padding: 6px 0 6px 10px;
      border-top: 1px solid var(--pd-border);
      border-left: 3px solid var(--mat-sys-outline-variant);
      font: var(--mat-sys-body-small);
    }
    .entry.error {
      border-left-color: var(--mat-sys-error);
    }
    summary {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      cursor: pointer;
    }
    .when,
    .times {
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .source {
      font-weight: 600;
    }
    .message {
      flex: 1 1 100%;
      overflow-wrap: anywhere;
    }
    .more p {
      margin: 6px 0 0;
      color: var(--mat-sys-on-surface-variant);
    }
    pre {
      margin: 6px 0 0;
      padding: 8px;
      overflow-x: auto;
      border-radius: var(--pd-radius-small);
      background: color-mix(in srgb, var(--mat-sys-on-surface) 6%, transparent);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class SystemSettingsComponent {
  private readonly system = systemApi(inject(DASHBOARD_CLIENT).api);

  protected readonly status = httpResource<SystemStatus>(() => CORE_READS.systemStatus());
  protected readonly level = signal<LevelFilter>('all');

  /** Somebody who is not the owner opened the tab. */
  protected readonly forbidden = computed(() => errorStatus(this.status.error()) === 403);

  protected readonly entries = computed(() => {
    const level = this.level();
    const log = this.status.value()?.log ?? [];
    return level === 'all' ? log : log.filter((entry) => entry.level === level);
  });

  protected count(level: SystemLogLevel): number {
    return (this.status.value()?.log ?? []).filter((entry) => entry.level === level).length;
  }

  /** When the job last finished, or — if it never has — when it last started. */
  protected lastRun(job: SystemJob): string | null {
    return job.lastFinishedAt ?? job.lastStartedAt;
  }

  protected seconds(milliseconds: number): string {
    return (milliseconds / 1000).toFixed(1);
  }

  protected async clear(): Promise<void> {
    await this.system.clearLog();
    this.status.reload();
  }
}
