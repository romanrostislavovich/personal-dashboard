import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MusicApi } from '../music.api';

/** Home widget: plays of the user's SoundCloud tracks, their growth over the week, followers. */
@Component({
  selector: 'pd-soundcloud-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, MatCardModule, MatButtonModule, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>☁️ SoundCloud</mat-card-title>
      </mat-card-header>
      <mat-card-content class="content">
        @if (stats.value(); as s) {
          <div class="stat">
            <span class="label">{{ 'music.soundcloud.plays' | transloco }}</span>
            <span class="value">{{ s.totals.plays | number }}</span>
            <span class="sub">
              +{{ s.playsDelta.week | number }} {{ 'music.soundcloud.perWeek' | transloco }}
            </span>
          </div>
          <div class="stat">
            <span class="label">{{ 'music.soundcloud.followers' | transloco }}</span>
            <span class="value">{{ s.followers | number }}</span>
            <span class="sub">
              +{{ s.followersWeek | number }} {{ 'music.soundcloud.perWeek' | transloco }}
            </span>
          </div>
        } @else if (!stats.isLoading()) {
          <p class="muted">{{ 'music.soundcloud.widgetEmpty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/music/soundcloud">{{ 'music.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 12px;
      padding-top: 12px;
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
    .sub {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .muted {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SoundcloudWidget {
  protected readonly stats = inject(MusicApi).soundcloud();
}
