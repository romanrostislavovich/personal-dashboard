import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { TrackedRepo } from '@pd/contracts';
import { SparklineComponent } from '@pd/web-core';

/** Repository card: key figures, star growth and a 30-day chart. */
@Component({
  selector: 'pd-repo-card',
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
  ],
  template: `
    @let r = repo();
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>
          <a [href]="r.htmlUrl" target="_blank" rel="noopener">{{ r.fullName }}</a>
        </mat-card-title>
        @if (r.description) {
          <mat-card-subtitle>{{ r.description }}</mat-card-subtitle>
        }
      </mat-card-header>

      <mat-card-content>
        @if (r.syncError) {
          <p class="error">
            <mat-icon inline>warning</mat-icon> {{ 'development.oss.syncError' | transloco }}:
            {{ r.syncError }}
          </p>
        }

        <div class="stats">
          <div class="stat">
            <span class="label">{{ 'development.oss.stars' | transloco }}</span>
            <span class="value">{{ r.stars | number }}</span>
            <span class="delta" [class.up]="r.starsDelta.week > 0">
              {{ r.starsDelta.week > 0 ? '+' : '' }}{{ r.starsDelta.week }}
              {{ 'development.oss.perWeek' | transloco }}
            </span>
          </div>
          <div class="stat">
            <span class="label">{{ 'development.oss.forks' | transloco }}</span>
            <span class="value">{{ r.forks | number }}</span>
          </div>
          <div class="stat">
            <span class="label">{{ 'development.oss.issues' | transloco }}</span>
            <a class="value" [href]="r.htmlUrl + '/issues'" target="_blank" rel="noopener">
              {{ r.openIssues }}
            </a>
          </div>
          <div class="stat">
            <span class="label">{{ 'development.oss.pulls' | transloco }}</span>
            <a class="value" [href]="r.htmlUrl + '/pulls'" target="_blank" rel="noopener">
              {{ r.openPulls }}
            </a>
          </div>
          @if (r.npmPackage) {
            <div class="stat">
              <span class="label">{{ 'development.oss.npmWeekly' | transloco }}</span>
              <a
                class="value"
                [href]="'https://www.npmjs.com/package/' + r.npmPackage"
                target="_blank"
                rel="noopener"
              >
                {{ r.npmWeeklyDownloads === null ? '—' : (r.npmWeeklyDownloads | number) }}
              </a>
            </div>
          }
        </div>

        <div class="chart">
          <span class="label">{{ 'development.oss.starsHistory' | transloco }}</span>
          @if (starsHistory().length > 1) {
            <pd-sparkline
              [points]="starsHistory()"
              [label]="'development.oss.starsHistory' | transloco"
            />
          } @else {
            <p class="hint">{{ 'development.oss.historyCollecting' | transloco }}</p>
          }
        </div>

        <p class="meta">
          @if (r.latestRelease) {
            <span>
              🚀 {{ r.latestRelease.tag }} · {{ r.latestRelease.publishedAt | date: 'd MMM y' }}
            </span>
          }
          @if (r.pushedAt) {
            <span>{{ 'development.oss.lastPush' | transloco }} {{ r.pushedAt | date: 'd MMM y' }}</span>
          }
        </p>
      </mat-card-content>

      <mat-card-actions align="end">
        <button
          matIconButton
          [matTooltip]="'core.actions.edit' | transloco"
          [attr.aria-label]="'core.actions.edit' | transloco"
          (click)="edit.emit(r)"
        >
          <mat-icon>edit</mat-icon>
        </button>
        <button
          matIconButton
          [matTooltip]="'core.actions.delete' | transloco"
          (click)="remove.emit(r)"
        >
          <mat-icon>delete</mat-icon>
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    mat-card-title a {
      color: inherit;
      text-decoration: none;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: 12px;
      margin: 12px 0;
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
      color: inherit;
      text-decoration: none;
    }
    .delta {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .delta.up {
      color: var(--mat-sys-primary);
    }
    .chart {
      margin: 8px 0;
    }
    .hint,
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin: 8px 0 0;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
})
export class RepoCardComponent {
  readonly repo = input.required<TrackedRepo>();
  readonly edit = output<TrackedRepo>();
  readonly remove = output<TrackedRepo>();

  protected readonly starsHistory = computed(() =>
    this.repo().history.map((point) => ({ at: point.day, value: point.stars })),
  );
}
