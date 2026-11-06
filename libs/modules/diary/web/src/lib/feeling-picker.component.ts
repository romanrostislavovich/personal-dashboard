import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {MOODS} from '@pd/contracts';

/**
 * One question of the evening check-in next to the mood — energy or anxiety — as five small
 * buttons 1–5; a second tap on the chosen one clears it.
 */
@Component({
  selector: 'pd-diary-feeling-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div
      class="feeling"
      role="radiogroup"
      [attr.aria-label]="'diary.feelings.' + feeling() + '.label' | transloco"
    >
      <span class="label">{{
        'diary.feelings.' + feeling() + '.label' | transloco
      }}</span>
      @for (score of scores; track score) {
        <button
          type="button"
          role="radio"
          class="score"
          [class.selected]="value() === score"
          [attr.aria-checked]="value() === score"
          [attr.title]="'diary.feelings.' + feeling() + '.' + score | transloco"
          (click)="changed.emit(value() === score ? null : score)"
        >
          {{ score }}
        </button>
      }
    </div>
  `,
  styles: `
    .feeling {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .label {
      margin-inline-end: 4px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .score {
      min-width: 32px;
      height: 32px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 16px;
      background: transparent;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-label-large);
      cursor: pointer;
    }
    .score.selected {
      border-color: var(--mat-sys-primary);
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .score:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }
  `,
})
export class FeelingPickerComponent {
  readonly feeling = input.required<'energy' | 'anxiety'>();
  readonly value = input<number | null>(null);
  readonly changed = output<number | null>();

  protected readonly scores = MOODS;
}
