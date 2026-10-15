import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Habit, isBuilding } from '@pd/contracts';
import { BUILD_ICON, HABIT_ICONS, HabitsApi } from './habits.api';

/** Home widget: the run of clean days of every habit. */
@Component({
  selector: 'pd-habits-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, RouterLink, TranslocoPipe],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🌱 {{ 'habits.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content class="list">
        @for (habit of habits.value(); track habit.id) {
          <div class="row">
            <span class="icon">{{ icon(habit) }}</span>
            <span class="name">{{ name(habit) }}</span>
            <span class="days">
              {{ 'habits.widget.days' | transloco: { days: habit.stats.currentStreak } }}
            </span>
          </div>
        } @empty {
          <p class="empty">{{ 'habits.widget.empty' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/habits">{{ 'habits.widget.all' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .icon {
      font-size: 20px;
    }
    .name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .days {
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-primary);
    }
    .empty {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class HabitsWidget {
  private readonly transloco = inject(TranslocoService);
  protected readonly habits = inject(HabitsApi).list();

  protected icon(habit: Habit): string {
    return isBuilding(habit.goal) ? BUILD_ICON : HABIT_ICONS[habit.kind];
  }

  protected name(habit: Habit): string {
    return habit.kind === 'custom'
      ? (habit.name ?? '')
      : this.transloco.translate(`habits.kinds.${habit.kind}`);
  }
}
