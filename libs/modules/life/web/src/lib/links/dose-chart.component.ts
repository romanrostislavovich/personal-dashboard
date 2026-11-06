import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {CorrelationLag, CorrelationMetric, doseGroups} from '@pd/contracts';
import {laterDay} from './correlation-scatter.component';
import {formatValue} from './links-format';

/**
 * Dose–response of a pair: the days in groups of the first number (as equal as ties allow),
 * with the second's average in each — "up to about 40 minutes the mood rises, then stays",
 * which a straight line hides. Rows of bars, so it reads on a phone too.
 */
@Component({
  selector: 'pd-dose-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @if (rows(); as rows) {
      <p class="title">
        {{ 'life.links.dose.title' | transloco: {a: name(a()), b: name(b())} }}
      </p>
      <ul class="rows">
        @for (row of rows; track row.range) {
          <li>
            <span class="range">{{ row.range }}</span>
            <span class="bar"><span [style.width.%]="row.width"></span></span>
            <span class="mean">{{ row.mean }}</span>
            <span class="days">{{
              'life.links.days' | transloco: {days: row.n}
            }}</span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .title {
      margin: 12px 0 6px;
      font: var(--mat-sys-label-large);
    }
    .rows {
      display: grid;
      grid-template-columns: auto minmax(60px, 1fr) auto auto;
      gap: 6px 10px;
      align-items: center;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: contents;
    }
    .range,
    .days {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .bar {
      height: 10px;
      border-radius: 5px;
      background: color-mix(in srgb, var(--mat-sys-on-surface) 8%, transparent);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--mat-sys-primary);
    }
    .mean {
      font: var(--mat-sys-title-small);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
})
export class DoseChartComponent {
  readonly a = input.required<CorrelationMetric>();
  readonly b = input.required<CorrelationMetric>();
  readonly lag = input.required<CorrelationLag>();

  private readonly transloco = inject(TranslocoService);

  protected name(metric: CorrelationMetric): string {
    return metric.label ?? this.transloco.translate(metric.labelKey);
  }

  protected readonly rows = computed(() => {
    const [a, b, lag] = [this.a(), this.b(), this.lag()];
    const later = new Map(b.values.map(value => [value.day, value.value]));
    const x: number[] = [];
    const y: number[] = [];
    for (const {day, value} of a.values) {
      const after = later.get(laterDay(day, lag));
      if (after !== undefined) {
        x.push(value);
        y.push(after);
      }
    }
    const groups = doseGroups(x, y);
    if (groups.length < 2) {
      return null;
    }
    const means = groups.map(group => group.mean);
    const [low, high] = [Math.min(...means), Math.max(...means)];
    const format = (metric: CorrelationMetric, value: number) =>
      formatValue(metric, value, this.transloco.getActiveLang(), hours =>
        this.transloco.translate('life.hours', {value: hours}),
      );
    return groups.map(group => ({
      range:
        group.from === group.to
          ? format(a, group.from)
          : `${format(a, group.from)}–${format(a, group.to)}`,
      // The lowest average still gets a sliver, so every group is seen.
      width: high > low ? 8 + ((group.mean - low) / (high - low)) * 92 : 50,
      mean: format(b, group.mean),
      n: group.n,
    }));
  });
}
