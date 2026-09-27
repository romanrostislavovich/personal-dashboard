import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SparklineComponent } from '@pd/web-core';
import { DiaryApi } from './diary.api';

/** Home widget: day streak, today's entry and the month's mood. */
@Component({
  selector: 'pd-diary-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
    SparklineComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>📔 {{ 'diary.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (stats.value(); as s) {
          <p class="streak">
            🔥 <b>{{ s.currentStreak }}</b> {{ 'diary.widget.daysInRow' | transloco }}
          </p>
          <p class="today" [class.done]="s.hasEntryToday">
            <mat-icon inline>{{
              s.hasEntryToday ? 'check_circle' : 'radio_button_unchecked'
            }}</mat-icon>
            {{ (s.hasEntryToday ? 'diary.widget.written' : 'diary.widget.notWritten') | transloco }}
          </p>
          @if (moodPoints().length > 1) {
            <span class="label">{{ 'diary.widget.mood' | transloco }}</span>
            <pd-sparkline
              [points]="moodPoints()"
              [min]="1"
              [max]="5"
              [label]="'diary.widget.mood' | transloco"
            />
          }
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/diary">{{ 'diary.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .streak {
      font: var(--mat-sys-title-medium);
      margin: 12px 0 4px;
    }
    .today {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--mat-sys-on-surface-variant);
    }
    .today.done {
      color: var(--mat-sys-primary);
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class DiaryWidget {
  protected readonly stats = inject(DiaryApi).stats();
  protected readonly moodPoints = computed(
    () => this.stats.value()?.moodHistory.map((p) => ({ at: p.day, value: p.mood })) ?? [],
  );
}
