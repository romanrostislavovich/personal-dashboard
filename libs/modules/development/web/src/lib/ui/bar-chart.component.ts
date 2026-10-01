import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface Bar {
  /** Under the bar (a month, a day); may be empty to keep the axis readable. */
  label: string;
  value: number;
  /** Shown on hover: "12 March — 3 h 20 min". */
  title: string;
}

/** A small column chart of one series: bars are scaled to the largest value. */
@Component({
  selector: 'pd-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" role="img" [attr.aria-label]="label()">
      @for (bar of scaled(); track $index) {
        <div class="column" [title]="bar.title">
          <span class="bar" [class.empty]="bar.value === 0" [style.height.%]="bar.percent"></span>
        </div>
      }
    </div>
    <div class="labels" aria-hidden="true">
      @for (bar of scaled(); track $index) {
        <span>{{ bar.label }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart,
    .labels {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: 2px;
    }
    .chart {
      height: 120px;
      align-items: end;
    }
    .column {
      display: flex;
      align-items: flex-end;
      height: 100%;
    }
    .column:hover .bar {
      opacity: 0.75;
    }
    .bar {
      width: 100%;
      /* A day with a little activity is still visible. */
      min-height: 2px;
      border-radius: 3px 3px 0 0;
      background: var(--mat-sys-primary);
    }
    .bar.empty {
      background: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
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

  protected readonly scaled = computed(() => {
    const bars = this.bars();
    const max = Math.max(1, ...bars.map((bar) => bar.value));
    return bars.map((bar) => ({ ...bar, percent: (bar.value / max) * 100 }));
  });
}
