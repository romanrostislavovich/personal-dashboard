import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** «Сегодня» / «Завтра» / «через 5 дн.» — с подсветкой, если скоро. */
@Component({
  selector: 'pd-birthday-when',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @switch (daysUntil()) {
      @case (0) {
        <span class="chip today">🎉 {{ 'birthdays.today' | transloco }}</span>
      }
      @case (1) {
        <span class="chip soon">{{ 'birthdays.tomorrow' | transloco }}</span>
      }
      @default {
        <span class="chip" [class.soon]="daysUntil() <= 7">
          {{ 'birthdays.inDays' | transloco: { days: daysUntil() } }}
        </span>
      }
    }
  `,
  styles: `
    .chip {
      padding: 2px 10px;
      border-radius: 12px;
      font: var(--mat-sys-label-medium);
      background: var(--mat-sys-surface-container-high);
      white-space: nowrap;
    }
    .soon {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .today {
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
    }
  `,
})
export class BirthdayWhenComponent {
  readonly daysUntil = input.required<number>();
}
