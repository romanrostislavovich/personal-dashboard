import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoPipe } from '@jsverse/transloco';
import { Correlation, CorrelationMetric } from '@pd/contracts';
import { moduleColor, rhoColor, SelectedPair } from './links-format';

/**
 * Every pair at a glance: a row and a column for each number, the cell coloured by how the two
 * go together — of the same day, or a row's day against the column's next day. A dot marks a
 * strong link; a click opens the pair.
 */
@Component({
  selector: 'pd-correlation-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatButtonToggleModule, TranslocoPipe],
  template: `
    <mat-button-toggle-group
      hideSingleSelectionIndicator
      [value]="lag()"
      [attr.aria-label]="'life.links.matrix.lag' | transloco"
      (change)="lag.set($event.value)"
    >
      <mat-button-toggle [value]="0">{{ 'life.links.sameDay' | transloco }}</mat-button-toggle>
      <mat-button-toggle [value]="1">{{ 'life.links.nextDay' | transloco }}</mat-button-toggle>
    </mat-button-toggle-group>
    <p class="hint">
      {{ (lag() ? 'life.links.matrix.hintNext' : 'life.links.matrix.hintSame') | transloco }}
    </p>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th></th>
            @for (column of shown(); track column.key) {
              <th class="column" scope="col">
                <span [style.border-color]="color(column)">
                  {{ column.label ?? (column.labelKey | transloco) }}
                </span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of shown(); track row.key) {
            <tr>
              <th class="row" scope="row" [style.border-color]="color(row)">
                {{ row.label ?? (row.labelKey | transloco) }}
              </th>
              @for (column of shown(); track column.key) {
                @let pair = cell(row.key, column.key);
                <td>
                  @if (pair) {
                    <button
                      type="button"
                      [style.background]="background(pair.rho)"
                      [attr.aria-label]="pair.rho | number: '1.2-2'"
                      [title]="pair.rho | number: '1.2-2'"
                      (click)="pick.emit({ a: pair.a, b: pair.b, lag: pair.lag })"
                    >
                      @if (pair.strong) {
                        <span class="dot"></span>
                      }
                    </button>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    <div class="legend">
      <span>−1</span>
      <span class="scale"></span>
      <span>+1</span>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
      min-width: 0;
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .scroll {
      max-width: 100%;
      overflow-x: auto;
    }
    table {
      border-collapse: separate;
      border-spacing: 2px;
    }
    th {
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }
    th.row {
      text-align: right;
      padding-right: 6px;
      border-right: 3px solid;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th.column {
      height: 150px;
      vertical-align: bottom;
    }
    th.column span {
      display: inline-block;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      max-height: 145px;
      overflow: hidden;
      text-overflow: ellipsis;
      border-left: 3px solid;
      padding-left: 2px;
    }
    td {
      width: 22px;
      height: 22px;
      padding: 0;
    }
    button {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover,
    button:focus-visible {
      outline: 2px solid var(--mat-sys-on-surface);
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--mat-sys-surface);
    }
    .legend {
      display: flex;
      align-items: center;
      gap: 8px;
      font: var(--mat-sys-label-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .scale {
      width: 160px;
      height: 10px;
      border-radius: 5px;
      background: linear-gradient(
        to right,
        var(--mat-sys-error),
        var(--mat-sys-surface-container),
        var(--mat-sys-primary)
      );
    }
  `,
})
export class CorrelationMatrixComponent {
  readonly metrics = input.required<CorrelationMetric[]>();
  readonly correlations = input.required<Correlation[]>();
  readonly pick = output<SelectedPair>();

  protected readonly lag = signal<0 | 1>(0);

  private readonly byPair = computed(() => {
    const map = new Map<string, Correlation>();
    for (const pair of this.correlations()) {
      if (pair.lag === this.lag()) {
        map.set(`${pair.a}|${pair.b}`, pair);
      }
    }
    return map;
  });

  /** The numbers compared with anything at this lag, by section. */
  protected readonly shown = computed(() => {
    const keys = new Set([...this.byPair().values()].flatMap((pair) => [pair.a, pair.b]));
    return this.metrics()
      .filter((metric) => keys.has(metric.key))
      .sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key));
  });

  /** Of the same day the pair is kept once, in key order: found either way round. */
  protected cell(row: string, column: string): Correlation | undefined {
    const pairs = this.byPair();
    return (
      pairs.get(`${row}|${column}`) ?? (this.lag() ? undefined : pairs.get(`${column}|${row}`))
    );
  }

  protected background(rho: number): string {
    return rhoColor(rho);
  }

  protected color(metric: CorrelationMetric): string {
    return moduleColor(metric.module);
  }
}
