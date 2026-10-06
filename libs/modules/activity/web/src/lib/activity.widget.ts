import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DurationPipe } from '@pd/web-core';
import { lastDays } from './activity-period';
import { ActivityApi } from './activity.api';

const WIDGET_MAX_APPS = 4;

/** Home widget: time at the computer today and the programs it went to. */
@Component({
  selector: 'pd-activity-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatCardModule, TranslocoPipe, DurationPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🖥️ {{ 'activity.widget.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content class="content">
        <span class="value">{{ stats.value()?.totalSeconds | pdDuration }}</span>
        @for (app of apps(); track app.app) {
          <p class="row">
            <span class="name">{{ app.name }}</span>
            <span class="muted">{{ app.seconds | pdDuration }}</span>
          </p>
        } @empty {
          @if (!stats.isLoading()) {
            <p class="muted">{{ 'activity.widget.empty' | transloco }}</p>
          }
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/activity">{{ 'activity.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      padding-top: 8px;
    }
    .value {
      margin-bottom: 4px;
      font: var(--mat-sys-headline-small);
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin: 2px 0;
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .muted {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
  `,
})
export class ActivityWidget {
  protected readonly stats = inject(ActivityApi).stats(() => lastDays(1));
  protected readonly apps = computed(() =>
    (this.stats.value()?.apps ?? []).slice(0, WIDGET_MAX_APPS),
  );
}
