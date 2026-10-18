import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CHART_TICKS, niceCeil } from './chart-scale';

export interface Bar {
  /** Under the bar (a month, a day); may be empty to keep the axis readable. */
  label: string;
  value: number;
  /** Shown on hover: "12 March — 3 h 20 min". */
  title: string;
  /** Written over the bar ("4,2") when the chart shows its values (`values`). */
  display?: string;
}

/**
 * A column chart of one series, in the look every chart of the dashboard shares (the classes
 * `pd-chart-*` of the global styles): gridlines with a round scale when `format` is given, the
 * hovered bar's `title` in a tooltip, the bars scaled to the top of the scale.
 */
@Component({
  selector: 'pd-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="plot" [class.with-scale]="!!format()" (pointerleave)="hovered.set(null)">
      @if (format(); as fmt) {
        <div class="grid" aria-hidden="true">
          @for (tick of ticks; track tick) {
            <div class="gridline" [style.bottom.%]="tick * 100">
              <span class="pd-chart-tick tick">{{ fmt(top() * tick) }}</span>
            </div>
          }
        </div>
      }
      <div class="chart" role="img" [attr.aria-label]="label()">
        @for (bar of scaled(); track $index; let i = $index) {
          <div
            class="column"
            [class.dimmed]="hovered() !== null && hovered() !== i"
            (pointerenter)="hovered.set(i)"
          >
            @if (values() && bar.display) {
              <span class="value">{{ bar.display }}</span>
            }
            <span class="bar" [class.empty]="bar.value === 0" [style.height.%]="bar.percent"></span>
          </div>
        }
      </div>
      @if (hoveredBar(); as bar) {
        <span
          class="pd-chart-tooltip tooltip"
          [class.right]="bar.center > 60"
          [style.left.%]="bar.center"
        >
          {{ bar.title }}
        </span>
      }
    </div>
    <div class="labels" [class.with-scale]="!!format()" aria-hidden="true">
      @for (bar of scaled(); track $index) {
        <span>{{ bar.label }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .plot {
      position: relative;
    }
    /* Room for the longest mark of the scale ("2 h 30 min"). */
    .with-scale {
      margin-left: 72px;
    }
    .grid {
      position: absolute;
      inset: 0;
    }
    .gridline {
      position: absolute;
      left: 0;
      right: 0;
      border-top: 1px solid var(--pd-chart-grid);
    }
    .gridline:first-child {
      border-top-color: var(--mat-sys-outline-variant);
    }
    .tick {
      position: absolute;
      right: calc(100% + 8px);
      transform: translateY(-50%);
    }
    .chart,
    .labels {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: 2px;
    }
    .chart {
      position: relative;
      height: 120px;
      align-items: end;
    }
    .column {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      height: 100%;
      border-radius: 6px 6px 0 0;
    }
    .column:hover {
      background: var(--pd-chart-hover);
    }
    .dimmed .bar {
      opacity: 0.55;
    }
    .value {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }
    .bar {
      width: 100%;
      /* A day with a little activity is still visible. */
      min-height: 2px;
      border-radius: var(--pd-chart-bar-radius);
      background: var(--pd-chart-primary);
      transition: opacity 120ms;
    }
    .bar.empty {
      background: var(--pd-chart-empty);
    }
    /* Inside the plot, over the bars: never over the card's title above it. */
    .tooltip {
      top: 4px;
    }
    .labels {
      margin-top: 4px;
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }
    .labels span {
      overflow: hidden;
      white-space: nowrap;
    }
  `,
})
export class BarChartComponent {
  readonly bars = input.required<Bar[]>();
  /** Description for screen readers, for example "Coding time per day". */
  readonly label = input('');
  /** The bars' `display` over them: for a few bars whose numbers matter (mood by weekday). */
  readonly values = input(false);
  /**
   * How a value of the scale is written ("2 h", "500"): given, the chart draws gridlines and a
   * round scale on the left; without it, the bars alone.
   */
  readonly format = input<((value: number) => string) | null>(null);
  /** What the scale is round in: 3600 for seconds shown in hours, so the top is whole hours. */
  readonly unit = input(1);

  protected readonly ticks = CHART_TICKS;
  protected readonly hovered = signal<number | null>(null);

  /** The top of the scale: a round number over the largest bar when there is a scale. */
  protected readonly top = computed(() => {
    const max = Math.max(1, ...this.bars().map((bar) => bar.value));
    const unit = this.unit();
    return this.format() ? niceCeil(max / unit) * unit : max;
  });

  protected readonly scaled = computed(() => {
    const top = this.top();
    const count = this.bars().length;
    return this.bars().map((bar, i) => ({
      ...bar,
      percent: (bar.value / top) * 100,
      center: ((i + 0.5) / count) * 100,
    }));
  });

  protected readonly hoveredBar = computed(() => {
    const index = this.hovered();
    return index === null ? null : (this.scaled()[index] ?? null);
  });
}
