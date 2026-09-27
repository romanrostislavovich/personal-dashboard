import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { Achievement } from '@pd/contracts';

/** One achievement: icon, title, description and either progress or the unlock date. */
@Component({
  selector: 'pd-achievement-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, MatProgressBarModule, TranslocoPipe],
  template: `
    @let a = achievement();
    <div class="card" [class.locked]="!a.unlockedAt">
      <span class="icon" aria-hidden="true">{{ a.icon }}</span>
      <div class="body">
        <span class="title">{{ a.title }}</span>
        <span class="description">{{ a.description }}</span>
        @if (a.unlockedAt) {
          <span class="unlocked">
            {{ 'achievements.unlockedAt' | transloco }} {{ a.unlockedAt | date: 'd MMM y' }}
          </span>
        } @else {
          <mat-progress-bar mode="determinate" [value]="percent()" />
          <span class="progress">{{ a.progress | number }} / {{ a.goal | number }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    .card {
      display: flex;
      gap: 12px;
      height: 100%;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 12px;
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-low);
    }
    .icon {
      font-size: 36px;
      line-height: 1;
    }
    /* Locked achievements are grey so unlocked ones stand out. */
    .locked .icon {
      filter: grayscale(1);
      opacity: 0.45;
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }
    .title {
      font: var(--mat-sys-title-small);
    }
    .description,
    .progress {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .unlocked {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-primary);
    }
    mat-progress-bar {
      margin-top: 4px;
    }
  `,
})
export class AchievementCardComponent {
  readonly achievement = input.required<Achievement>();

  protected readonly percent = computed(() => {
    const { progress, goal } = this.achievement();
    return (progress / goal) * 100;
  });
}
