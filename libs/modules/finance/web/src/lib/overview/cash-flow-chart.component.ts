import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Month, monthAsDate } from '@pd/web-core';
import { CashFlowMonth } from './finance-stats';

/** Gridlines: 0, half and the top of the scale. */
const TICKS = [0, 0.5, 1];

/**
 * Income next to expenses for the last months. Bars are HTML, not SVG: they stretch with the
 * card and keep their rounded tops. Hovering a month shows its numbers; clicking opens it.
 */
@Component({
  selector: 'pd-cash-flow-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, DatePipe, TranslocoPipe],
  template: `
    <div class="legend">
      <span class="key"><i class="swatch income"></i>{{ 'finance.kpi.income' | transloco }}</span>
      <span class="key"><i class="swatch expense"></i>{{ 'finance.kpi.expense' | transloco }}</span>
    </div>

    <div class="plot" (pointerleave)="hovered.set(null)">
      <div class="grid">
        @for (tick of ticks; track tick) {
          <div class="gridline" [style.bottom.%]="tick * 100">
            <span class="tick">{{
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
              <span class="bar expense" [style.height.%]="m.expenseHeight"></span>
            </span>
            <span class="month">{{ m.date | date: 'LLL' }}</span>
          </button>
        }
      </div>

      @if (hoveredBar(); as m) {
        <div class="tooltip" [style.left.%]="m.center" [class.right]="m.center > 60">
          <b>{{ m.date | date: 'LLLL yyyy' }}</b>
          <span><i class="swatch income"></i>{{ m.income | currency: currency() }}</span>
          <span><i class="swatch expense"></i>{{ m.expense | currency: currency() }}</span>
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
      --income: light-dark(#1baf7a, #199e70);
      --expense: light-dark(#eb6834, #d95926);
    }
    .legend {
      display: flex;
      gap: 16px;
      margin: 8px 0 20px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .key {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .swatch {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 3px;
      margin-right: 6px;
    }
    .swatch.income,
    .bar.income {
      background: var(--income);
    }
    .swatch.expense,
    .bar.expense {
      background: var(--expense);
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
      border-top: 1px solid var(--mat-sys-outline-variant);
      opacity: 0.6;
    }
    .gridline:first-child {
      opacity: 1;
    }
    .tick {
      position: absolute;
      right: calc(100% + 8px);
      transform: translateY(-50%);
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
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
      background: color-mix(in srgb, var(--mat-sys-on-surface) 4%, transparent);
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
      border-radius: 4px 4px 0 0;
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
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 12px;
      border-radius: var(--pd-radius-small);
      font: var(--mat-sys-body-small);
      white-space: nowrap;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      pointer-events: none;
      z-index: 1;
      text-transform: capitalize;
    }
    .tooltip.right {
      transform: translateX(-90%);
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

  protected readonly ticks = TICKS;
  protected readonly hovered = signal<number | null>(null);

  /** A round number above the largest bar, so the top gridline has a readable label. */
  protected readonly scaleMax = computed(() =>
    niceCeil(Math.max(...this.months().map((m) => Math.max(m.income, m.expense)), 0)),
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
      isSelected: m.month.year === selected.year && m.month.month === selected.month,
      center: ((i + 0.5) / count) * 100,
      label: `${m.month.month}/${m.month.year}: +${m.income} −${m.expense}`,
    }));
  });

  protected readonly hoveredBar = computed(() => {
    const index = this.hovered();
    return index === null ? null : this.bars()[index];
  });
}

/** 1 / 2 / 2.5 / 5 × 10ⁿ just above the value: 1830 → 2000, 420 → 500. */
function niceCeil(value: number): number {
  if (value <= 0) {
    return 0;
  }
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}
