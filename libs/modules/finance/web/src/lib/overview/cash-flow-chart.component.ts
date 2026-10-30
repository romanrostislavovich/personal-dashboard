import {CurrencyPipe, DatePipe} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {CHART_TICKS, Month, monthAsDate, niceCeil} from '@pd/web-core';
import {CashFlowMonth} from './finance-stats';

/**
 * Income next to expenses for the last months. Bars are HTML, not SVG: they stretch with the
 * card and keep their rounded tops. Hovering a month shows its numbers; clicking opens it.
 */
@Component({
  selector: 'pd-cash-flow-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, TranslocoPipe],
  template: `
    <div class="pd-chart-legend legend">
      <span
        ><i class="pd-chart-swatch income"></i
        >{{ 'finance.kpi.income' | transloco }}</span
      >
      <span
        ><i class="pd-chart-swatch expense"></i
        >{{ 'finance.kpi.expense' | transloco }}</span
      >
    </div>

    <div class="plot" (pointerleave)="hovered.set(null)">
      <div class="grid">
        @for (tick of ticks; track tick) {
          <div class="gridline" [style.bottom.%]="tick * 100">
            <span class="pd-chart-tick tick">{{
              scaleMax() * tick | currency: currency() : 'symbol' : '1.0-0'
            }}</span>
          </div>
        }
      </div>
      <div class="columns">
        @for (m of bars(); track m.key; let i = $index) {
          <button
            type="button"
            class="column"
            [class.selected]="m.isSelected"
            [class.dimmed]="hovered() !== null && hovered() !== i"
            (pointerenter)="hovered.set(i)"
            (focus)="hovered.set(i)"
            (blur)="hovered.set(null)"
            (click)="selectMonth.emit(m.month)"
            [attr.aria-label]="m.label"
          >
            <span class="bars">
              <span class="bar income" [style.height.%]="m.incomeHeight"></span>
              <span
                class="bar expense"
                [style.height.%]="m.expenseHeight"
              ></span>
            </span>
            <span class="month">{{ m.date | date: 'LLL' }}</span>
          </button>
        }
      </div>

      @if (hoveredBar(); as m) {
        <div
          class="pd-chart-tooltip tooltip"
          [style.left.%]="m.center"
          [class.right]="m.center > 60"
        >
          <b>{{ m.date | date: 'LLLL yyyy' }}</b>
          <span
            ><i class="pd-chart-swatch income"></i
            >{{ m.income | currency: currency() }}</span
          >
          <span
            ><i class="pd-chart-swatch expense"></i
            >{{ m.expense | currency: currency() }}</span
          >
          <span class="net"
            >{{ 'finance.kpi.left' | transloco }}:
            {{ m.income - m.expense | currency: currency() }}</span
          >
        </div>
      }
    </div>

    <!-- The same numbers for screen readers. -->
    <table class="visually-hidden">
      <tr>
        <th></th>
        <th>{{ 'finance.kpi.income' | transloco }}</th>
        <th>{{ 'finance.kpi.expense' | transloco }}</th>
      </tr>
      @for (m of bars(); track m.key) {
        <tr>
          <th>{{ m.date | date: 'LLLL yyyy' }}</th>
          <td>{{ m.income | currency: currency() }}</td>
          <td>{{ m.expense | currency: currency() }}</td>
        </tr>
      }
    </table>
  `,
  styles: `
    :host {
      display: block;
    }
    .legend {
      margin: 8px 0 20px;
    }
    .pd-chart-swatch.income,
    .bar.income {
      background: var(--pd-chart-income);
    }
    .pd-chart-swatch.expense,
    .bar.expense {
      background: var(--pd-chart-expense);
    }
    .plot {
      position: relative;
      height: 220px;
      margin-left: 56px;
    }
    /* The bar area: the month labels (24px) sit under it. */
    .grid {
      position: absolute;
      inset: 0 0 24px;
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
    .columns {
      position: absolute;
      inset: 0;
      display: flex;
    }
    .column {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      cursor: pointer;
      border-radius: var(--pd-radius-small);
    }
    .column:hover,
    .column:focus-visible {
      background: var(--pd-chart-hover);
      outline: none;
    }
    .bars {
      flex: 1;
      display: flex;
      align-items: flex-end;
      gap: 2px;
      width: 100%;
      max-width: 56px;
      padding: 0 6px;
      box-sizing: border-box;
    }
    .bar {
      flex: 1;
      min-height: 0;
      border-radius: var(--pd-chart-bar-radius);
      transition: opacity 120ms;
    }
    .dimmed .bar {
      opacity: 0.4;
    }
    .month {
      height: 24px;
      line-height: 24px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
      text-transform: capitalize;
    }
    .selected .month {
      color: var(--mat-sys-on-surface);
      font-weight: 700;
    }
    .tooltip {
      top: 0;
      text-transform: capitalize;
    }
    .tooltip span {
      display: flex;
      align-items: center;
    }
    .net {
      margin-top: 2px;
      text-transform: none;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class CashFlowChartComponent {
  readonly months = input.required<CashFlowMonth[]>();
  readonly currency = input.required<string>();
  readonly selected = input.required<Month>();
  readonly selectMonth = output<Month>();

  protected readonly ticks = CHART_TICKS;
  protected readonly hovered = signal<number | null>(null);

  /** A round number above the largest bar, so the top gridline has a readable label. */
  protected readonly scaleMax = computed(() =>
    niceCeil(
      Math.max(...this.months().map(m => Math.max(m.income, m.expense)), 0),
    ),
  );

  protected readonly bars = computed(() => {
    const max = this.scaleMax() || 1;
    const selected = this.selected();
    const count = this.months().length;
    return this.months().map((m, i) => ({
      ...m,
      key: `${m.month.year}-${m.month.month}`,
      date: monthAsDate(m.month),
      incomeHeight: (m.income / max) * 100,
      expenseHeight: (m.expense / max) * 100,
      isSelected:
        m.month.year === selected.year && m.month.month === selected.month,
      center: ((i + 0.5) / count) * 100,
      label: `${m.month.month}/${m.month.year}: +${m.income} −${m.expense}`,
    }));
  });

  protected readonly hoveredBar = computed(() => {
    const index = this.hovered();
    return index === null ? null : this.bars()[index];
  });
}
