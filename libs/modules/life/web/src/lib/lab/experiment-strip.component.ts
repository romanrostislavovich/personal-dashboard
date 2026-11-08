import {toSignal} from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {Experiment} from '@pd/contracts';
import {dayOf, Wording} from '../links/question-wording';

/**
 * Every day of an experiment's plan as a square: its kind by colour, filled once it has a value,
 * dashed when not kept, faint while it is to come. Each square says the same in words (a screen
 * reader, a long press), and the legend names every look.
 */
@Component({
  selector: 'pd-experiment-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <ul class="strip" [attr.aria-label]="'life.lab.days' | transloco">
      @for (day of days(); track day.day) {
        <li
          [class]="day.condition"
          [class.filled]="day.filled"
          [class.skipped]="day.kept === false"
          [class.future]="day.future"
          [class.today]="day.day === today()"
          [attr.title]="day.title"
          [attr.aria-label]="day.title"
        ></li>
      }
    </ul>
    <p class="legend">
      <span
        ><i class="ordinary filled"></i
        >{{ 'life.lab.condition.ordinary' | transloco }}</span
      >
      <span
        ><i class="changed filled"></i
        >{{ 'life.lab.condition.changed' | transloco }}</span
      >
      <span><i class="ordinary"></i>{{ 'life.lab.missing' | transloco }}</span>
      <span
        ><i class="ordinary skipped"></i
        >{{ 'life.lab.notKept' | transloco }}</span
      >
      <span
        ><i class="ordinary future"></i
        >{{ 'life.lab.toCome' | transloco }}</span
      >
    </p>
  `,
  styles: `
    :host {
      display: block;
    }
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin: 12px 0 4px;
      padding: 0;
      list-style: none;
    }
    .strip li,
    i {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      box-sizing: border-box;
      border: 2px solid var(--mat-sys-outline);
    }
    i {
      display: inline-block;
      vertical-align: middle;
      margin-inline-end: 4px;
    }
    .changed {
      border-color: var(--mat-sys-tertiary);
    }
    .ordinary.filled {
      background: var(--mat-sys-outline);
    }
    .changed.filled {
      background: var(--mat-sys-tertiary);
    }
    .future {
      opacity: 0.35;
    }
    .skipped {
      border-style: dashed;
      background: none;
    }
    .strip .today {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 1px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ExperimentStripComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly experiment = input.required<Experiment>();
  readonly today = input.required<string>();
  /** A value in the experiment's unit. */
  readonly format = input.required<(value: number) => string>();

  protected readonly days = computed(() => {
    const wording: Wording = {
      locale: this.language(),
      translate: (key, params) => this.transloco.translate(key, params),
    };
    const today = this.today();
    const format = this.format();
    return this.experiment().days.map(day => {
      const future = day.day > today;
      const parts = [
        dayOf(day.day, wording),
        this.transloco.translate(`life.lab.condition.${day.condition}`),
      ];
      if (future) {
        parts.push(this.transloco.translate('life.lab.toCome'));
      } else {
        parts.push(
          day.value === null
            ? this.transloco.translate('life.lab.missing')
            : format(day.value),
        );
        if (day.kept === false) {
          parts.push(this.transloco.translate('life.lab.notKept'));
        }
      }
      return {
        ...day,
        future,
        filled: day.value !== null && day.kept !== false,
        title: parts.join(' · '),
      };
    });
  });
}
