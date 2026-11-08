import {toSignal} from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {EXPERIMENT_MIN_EACH, ExperimentResult} from '@pd/contracts';

/**
 * What came of an experiment, told as a description: each kind's mean and days, the difference
 * with its 95 % range; or how many more days of which kind are needed; and the days left out.
 */
@Component({
  selector: 'pd-experiment-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (told(); as told) {
      <p>{{ told.groups }}</p>
      <p class="difference">{{ told.difference }}</p>
      <p class="muted">{{ 'life.lab.caution' | transloco }}</p>
    } @else {
      <p class="muted">{{ needed() }}</p>
    }
    @if (result().notKept || result().missing) {
      <p class="muted">
        {{
          'life.lab.leftOut'
            | transloco: {notKept: result().notKept, missing: result().missing}
        }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin-top: 12px;
    }
    p {
      margin: 4px 0 0;
      overflow-wrap: anywhere;
    }
    .difference {
      font: var(--mat-sys-title-medium);
    }
    .muted {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ExperimentResultComponent {
  private readonly transloco = inject(TranslocoService);
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly result = input.required<ExperimentResult>();
  /** A value in the experiment's unit. */
  readonly format = input.required<(value: number) => string>();

  /** "Ordinary days: 3.1 (8 d) · changed: 3.8 (7 d)" and the difference with its range. */
  protected readonly told = computed(() => {
    this.language();
    const result = this.result();
    const {ordinary, changed, difference} = result;
    if (
      !result.enough ||
      ordinary.mean === null ||
      changed.mean === null ||
      difference === null
    ) {
      return null;
    }
    const format = this.format();
    const signed = (value: number) =>
      `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
    const groups = this.transloco.translate('life.lab.groups', {
      ordinary: format(ordinary.mean),
      ordinaryDays: ordinary.n,
      changed: format(changed.mean),
      changedDays: changed.n,
    });
    const {interval} = result;
    return {
      groups,
      difference: interval
        ? this.transloco.translate('life.lab.difference', {
            value: signed(difference),
            from: signed(interval[0]),
            to: signed(interval[1]),
          })
        : this.transloco.translate('life.lab.differenceOnly', {
            value: signed(difference),
          }),
    };
  });

  /** How many more days are needed — of both kinds, or of the one still short. */
  protected readonly needed = computed(() => {
    this.language();
    const {ordinary, changed} = this.result();
    const more = {
      ordinary: Math.max(0, EXPERIMENT_MIN_EACH - ordinary.n),
      changed: Math.max(0, EXPERIMENT_MIN_EACH - changed.n),
    };
    const key = !more.ordinary
      ? 'life.lab.notEnoughChanged'
      : !more.changed
        ? 'life.lab.notEnoughOrdinary'
        : 'life.lab.notEnough';
    return this.transloco.translate(key, more);
  });
}
