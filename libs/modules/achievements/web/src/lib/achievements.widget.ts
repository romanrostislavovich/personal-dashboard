import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {RouterLink} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {RealtimeClient} from '@pd/web-core';
import {AchievementCardComponent} from './achievement-card.component';
import {AchievementsApi, lastLoaded} from './achievements.api';

const LATEST_COUNT = 2;

/** Home widget: how many are unlocked, the latest achievements and the closest one to unlock. */
@Component({
  selector: 'pd-achievements-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    TranslocoPipe,
    AchievementCardComponent,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title
          >🏆 {{ 'achievements.title' | transloco }}</mat-card-title
        >
        <!-- Nothing while the first load runs: "0 of 0" would read as no achievements. -->
        @if (list().length) {
          <mat-card-subtitle>
            {{
              'achievements.summary'
                | transloco: {unlocked: unlocked().length, total: total()}
            }}
          </mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content class="content">
        @if (achievements.error() && !list().length) {
          <span class="label">{{ 'achievements.failed' | transloco }}</span>
        }
        @for (achievement of latest(); track achievement.id) {
          <pd-achievement-card [achievement]="achievement" />
        }
        @if (next(); as achievement) {
          <span class="label">{{
            'achievements.widget.next' | transloco
          }}</span>
          <pd-achievement-card [achievement]="achievement" />
        }
      </mat-card-content>
      <mat-card-actions align="end">
        @if (achievements.error()) {
          <button matButton (click)="achievements.reload()">
            {{ 'achievements.retry' | transloco }}
          </button>
        }
        <a matButton routerLink="/achievements">{{
          'achievements.widget.all' | transloco
        }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 12px;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      margin-top: 4px;
    }
  `,
})
export class AchievementsWidget {
  protected readonly achievements = inject(AchievementsApi).list();
  protected readonly list = lastLoaded(this.achievements);

  constructor() {
    const unlocks = inject(RealtimeClient).achievementUnlocks;
    effect(() => {
      if (unlocks() > 0) {
        untracked(() => this.achievements.reload());
      }
    });
  }

  protected readonly total = computed(() => this.list().length);
  protected readonly unlocked = computed(() =>
    this.list().filter(a => a.unlockedAt),
  );

  protected readonly latest = computed(() =>
    [...this.unlocked()]
      .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
      .slice(0, LATEST_COUNT),
  );

  /** The locked achievement with the highest progress — "almost there". */
  protected readonly next = computed(() => {
    const locked = this.list().filter(a => !a.unlockedAt && a.progress > 0);
    return (
      locked.sort((a, b) => b.progress / b.goal - a.progress / a.goal)[0] ??
      null
    );
  });
}
