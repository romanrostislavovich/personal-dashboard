import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ACTIVITY_LOW_DISK_SHARE, ActivityComputer } from '@pd/contracts';
import { DurationPipe, SparklineComponent, SparklinePoint } from '@pd/web-core';
import { ActivityApi } from '../activity.api';

const GB = 1024 ** 3;

/** The computers with a tracker: disks, load and memory now, and over the last day. */
@Component({
  selector: 'pd-activity-computers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatCardModule,
    MatIconModule,
    TranslocoPipe,
    DurationPipe,
    SparklineComponent,
  ],
  template: `
    @for (computer of computers.value(); track computer.deviceId) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>computer</mat-icon>
          <mat-card-title>{{ computer.name }}</mat-card-title>
          <mat-card-subtitle>
            @if (computer.latest; as latest) {
              {{ 'activity.computers.measuredAt' | transloco }}
              {{ latest.at | date: 'd MMM, HH:mm' }} · {{ 'activity.computers.uptime' | transloco }}
              {{ latest.uptimeSeconds | pdDuration }}
            } @else {
              {{ 'activity.computers.noData' | transloco }}
            }
          </mat-card-subtitle>
        </mat-card-header>
        @if (computer.latest; as latest) {
          <mat-card-content class="content">
            <div class="meters">
              <div class="meter">
                <span class="label">{{ 'activity.computers.cpu' | transloco }}</span>
                <span class="value">{{ latest.cpu | number: '1.0-0' }}%</span>
                <pd-sparkline
                  [points]="cpu(computer)"
                  [min]="0"
                  [max]="100"
                  unit="%"
                  dateFormat="HH:mm"
                  [label]="'activity.computers.cpu' | transloco"
                />
              </div>
              <div class="meter">
                <span class="label">{{ 'activity.computers.memory' | transloco }}</span>
                <span class="value">
                  {{
                    'activity.computers.memoryUsed'
                      | transloco
                        : {
                            used: (latest.memoryUsed / gb | number: '1.1-1'),
                            total: (latest.memoryTotal / gb | number: '1.0-0'),
                          }
                  }}
                </span>
                <pd-sparkline
                  [points]="memory(computer)"
                  [min]="0"
                  [max]="100"
                  unit="%"
                  dateFormat="HH:mm"
                  [label]="'activity.computers.memory' | transloco"
                />
              </div>
            </div>
            <ul class="disks">
              @for (disk of latest.disks; track disk.mount) {
                <li [class.low]="disk.free / disk.total < lowShare">
                  <span class="mount">{{ disk.mount }}</span>
                  <span class="track">
                    <span class="fill" [style.width.%]="(1 - disk.free / disk.total) * 100"></span>
                  </span>
                  <span class="free">
                    {{
                      'activity.computers.free'
                        | transloco
                          : {
                              free: (disk.free / gb | number: '1.0-0'),
                              total: (disk.total / gb | number: '1.0-0'),
                            }
                    }}
                  </span>
                </li>
              }
            </ul>
          </mat-card-content>
        }
      </mat-card>
    } @empty {
      @if (!computers.isLoading()) {
        <p class="hint">{{ 'activity.computers.empty' | transloco }}</p>
      }
    }
    <p class="hint">{{ 'activity.computers.hint' | transloco }}</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 860px;
    }
    .hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 12px;
    }
    .meters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .meter {
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
    .disks {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .disks li {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }
    .mount {
      font-weight: 600;
    }
    .track {
      height: 8px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
    }
    .fill {
      display: block;
      height: 100%;
      border-radius: 4px;
      background: var(--mat-sys-primary);
    }
    .low .fill {
      background: var(--mat-sys-error);
    }
    .free {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    .low .free {
      color: var(--mat-sys-error);
    }
  `,
})
export class ComputersPage {
  protected readonly computers = inject(ActivityApi).computers();
  protected readonly gb = GB;
  protected readonly lowShare = ACTIVITY_LOW_DISK_SHARE;

  protected cpu(computer: ActivityComputer): SparklinePoint[] {
    return computer.history.map((point) => ({ at: point.at, value: point.cpu }));
  }

  protected memory(computer: ActivityComputer): SparklinePoint[] {
    return computer.history.map((point) => ({ at: point.at, value: point.memory }));
  }
}
