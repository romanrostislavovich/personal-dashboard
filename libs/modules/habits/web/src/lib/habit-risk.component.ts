import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {HabitLapse} from '@pd/contracts';

/**
 * Tomorrow's chance a habit slips (Links), as "7 in 10 (usually 3 in 10)": a gentle hint, never
 * "0 in 10" or "10 in 10" — a model is never that sure.
 */
@Component({
  selector: 'pd-habit-risk',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (tenths(); as shown) {
      <p class="risk" [class.high]="lapse().high">
        {{ 'habits.card.risk' | transloco: shown }}
      </p>
    }
  `,
  styles: `
    .risk {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .risk.high {
      color: var(--mat-sys-error);
    }
  `,
})
export class HabitRiskComponent {
  readonly lapse = input.required<HabitLapse>();

  /** The chance and the usual as tenths, 1–9; nothing to say without both. */
  protected readonly tenths = computed(() => {
    const {chance, usual} = this.lapse();
    if (chance === null || usual === null) {
      return null;
    }
    const tenth = (value: number) =>
      Math.min(9, Math.max(1, Math.round(value * 10)));
    return {chance: tenth(chance), usual: tenth(usual)};
  });
}
