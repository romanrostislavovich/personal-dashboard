import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { Achievement } from '@pd/contracts';
import { AchievementCardComponent } from './achievement-card.component';
import { AchievementsApi } from './achievements.api';

type Filter = 'all' | 'unlocked' | 'locked';

@Component({
  selector: 'pd-achievements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatCardModule,
    MatButtonToggleModule,
    MatProgressBarModule,
    TranslocoPipe,
    AchievementCardComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'achievements.title' | transloco }}</h1>
      <mat-button-toggle-group
        [value]="filter()"
        (change)="filter.set($event.value)"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="all">{{
          'achievements.filter.all' | transloco
        }}</mat-button-toggle>
        <mat-button-toggle value="unlocked">
          {{ 'achievements.filter.unlocked' | transloco }}
        </mat-button-toggle>
        <mat-button-toggle value="locked">
          {{ 'achievements.filter.locked' | transloco }}
        </mat-button-toggle>
      </mat-button-toggle-group>
    </header>

    <mat-card appearance="outlined" class="summary">
      <mat-card-content>
        <p class="count">
          {{ 'achievements.summary' | transloco: { unlocked: unlockedCount(), total: total() } }}
        </p>
        <mat-progress-bar mode="determinate" [value]="(unlockedCount() / (total() || 1)) * 100" />
      </mat-card-content>
    </mat-card>

    @for (group of groups(); track group.module) {
      <section class="group">
        <!-- Раздел называется так же, как модуль в меню: ключ перевода '<модуль>.title'. -->
        <h2 class="group-title">{{ group.module + '.title' | transloco }}</h2>
        <div class="grid">
          @for (achievement of group.items; track achievement.id) {
            <pd-achievement-card [achievement]="achievement" />
          }
        </div>
      </section>
    } @empty {
      <p class="empty">{{ 'achievements.empty' | transloco }}</p>
    }
  `,
  styles: `
    .summary {
      margin-bottom: 24px;
    }
    .count {
      font: var(--mat-sys-title-medium);
      margin: 8px 0 12px;
    }
    .group {
      margin-bottom: 24px;
    }
    .group-title {
      font: var(--mat-sys-title-medium);
      margin: 0 0 12px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
      gap: 12px;
    }
  `,
})
export class AchievementsPage {
  private readonly achievements = inject(AchievementsApi).list();

  protected readonly filter = signal<Filter>('all');
  protected readonly total = computed(() => this.achievements.value().length);
  protected readonly unlockedCount = computed(
    () => this.achievements.value().filter((a) => a.unlockedAt).length,
  );

  /** Группы по модулям в порядке регистрации метрик, с учётом фильтра. */
  protected readonly groups = computed(() => {
    const filter = this.filter();
    const visible = this.achievements
      .value()
      .filter((a) => filter === 'all' || (filter === 'unlocked') === Boolean(a.unlockedAt));
    const groups = new Map<string, Achievement[]>();
    for (const achievement of visible) {
      groups.set(achievement.module, [...(groups.get(achievement.module) ?? []), achievement]);
    }
    return [...groups].map(([module, items]) => ({ module, items }));
  });
}
