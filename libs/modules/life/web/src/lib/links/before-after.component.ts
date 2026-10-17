import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { CORE_READS } from '@pd/client-core';
import { BEFORE_AFTER_WEEKS, BeforeAfter, BeforeAfterChange } from '@pd/contracts';
import { formatValue } from './links-format';

const CHART = { width: 160, height: 36, pad: 3 };
/** As the server's MIN_WINDOW_DAYS: the days after a date it needs to compare. */
const MIN_WINDOW_DAYS = 7;

interface MiniChart {
  line: string;
  /** Where the event is, and the averages of the two sides. */
  at: number;
  before: { x1: number; x2: number; y: number };
  after: { x1: number; x2: number; y: number };
}

/**
 * Before and after a date of Health (a diagnosis, a medication began or ended): the daily
 * numbers that changed beyond what ordinary weeks do, each with its days around the date.
 * Shown only when Health tells of such a period.
 */
@Component({
  selector: 'pd-before-after',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    @if (data.value()?.results?.length) {
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>compare_arrows</mat-icon>
          <mat-card-title>{{ 'life.links.beforeAfter.title' | transloco }}</mat-card-title>
          <mat-card-subtitle>{{ 'life.links.beforeAfter.hint' | transloco }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="controls">
            <mat-form-field subscriptSizing="dynamic">
              <mat-label>{{ 'life.links.beforeAfter.event' | transloco }}</mat-label>
              <mat-select
                [value]="result()?.event?.id"
                (selectionChange)="chosen.set($event.value)"
              >
                @for (item of data.value()?.results ?? []; track item.event.id) {
                  <mat-option [value]="item.event.id">
                    {{ item.event.title }} ·
                    {{
                      'life.links.beforeAfter.' + item.event.edge
                        | transloco: { date: (item.event.on | date: 'mediumDate') }
                    }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-button-toggle-group
              hideSingleSelectionIndicator
              [value]="weeks()"
              [attr.aria-label]="'life.links.beforeAfter.window' | transloco"
              (change)="weeks.set($event.value)"
            >
              @for (option of weekOptions; track option) {
                <mat-button-toggle [value]="option">
                  {{ 'life.links.beforeAfter.weeks' | transloco: { weeks: option } }}
                </mat-button-toggle>
              }
            </mat-button-toggle-group>
          </div>

          @if (result(); as current) {
            @if (current.event.subtitle) {
              <p class="hint">{{ current.event.subtitle }}</p>
            }
            @if (!current.enough) {
              <p class="hint">
                {{
                  'life.links.beforeAfter.wait'
                    | transloco: { days: current.daysAfter, left: minDays - current.daysAfter }
                }}
              </p>
            } @else {
              @if (noHistory()) {
                <p class="hint">{{ 'life.links.beforeAfter.noHistory' | transloco }}</p>
              } @else if (!changed().length) {
                <p class="hint">{{ 'life.links.beforeAfter.none' | transloco }}</p>
              }
              <ul class="changes">
                @for (change of shown(); track change.key) {
                  <li [class.muted]="!change.changed">
                    <span class="name">{{ name(change) }}</span>
                    <span class="values">
                      {{ format(change, change.before) }} →
                      <b>{{ format(change, change.after) }}</b>
                      <span class="difference" [class.down]="change.difference < 0">
                        {{ differenceText(change) }}
                      </span>
                    </span>
                    @if (chartOf(change, current.event.on); as chart) {
                      <svg
                        class="chart"
                        [attr.viewBox]="'0 0 ' + chartSize.width + ' ' + chartSize.height"
                        aria-hidden="true"
                      >
                        <line
                          class="event"
                          [attr.x1]="chart.at"
                          [attr.x2]="chart.at"
                          y1="0"
                          [attr.y2]="chartSize.height"
                        />
                        <path class="line" [attr.d]="chart.line" />
                        <line
                          class="mean"
                          [attr.x1]="chart.before.x1"
                          [attr.x2]="chart.before.x2"
                          [attr.y1]="chart.before.y"
                          [attr.y2]="chart.before.y"
                        />
                        <line
                          class="mean after"
                          [attr.x1]="chart.after.x1"
                          [attr.x2]="chart.after.x2"
                          [attr.y1]="chart.after.y"
                          [attr.y2]="chart.after.y"
                        />
                      </svg>
                    }
                  </li>
                }
              </ul>
              @if (current.changes.length > changed().length) {
                <button matButton (click)="showAll.set(!showAll())">
                  {{
                    (showAll() ? 'life.links.beforeAfter.less' : 'life.links.beforeAfter.all')
                      | transloco: { count: current.changes.length - changed().length }
                  }}
                </button>
              }
            }
          }
          <p class="caution">
            <mat-icon>health_and_safety</mat-icon>
            <span>{{ 'life.links.beforeAfter.caution' | transloco }}</span>
          </p>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    mat-card-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 12px;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    mat-form-field {
      width: min(100%, 420px);
    }
    .hint,
    .caution {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .caution {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .caution mat-icon {
      flex: none;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .changes {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 160px;
      align-items: center;
      gap: 4px 16px;
    }
    @media (max-width: 599px) {
      li {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .chart {
        grid-column: 1 / -1;
      }
    }
    li.muted {
      opacity: 0.55;
    }
    .name {
      font: var(--mat-sys-body-medium);
    }
    .values {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .difference {
      margin-left: 6px;
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
    .difference.down {
      color: var(--mat-sys-error);
    }
    .chart {
      width: 160px;
      height: 36px;
      overflow: visible;
    }
    .line {
      fill: none;
      stroke: var(--mat-sys-outline);
      stroke-width: 1.2;
    }
    .event {
      stroke: var(--mat-sys-tertiary);
      stroke-dasharray: 2 2;
    }
    .mean {
      stroke: var(--mat-sys-on-surface-variant);
      stroke-width: 2;
    }
    .mean.after {
      stroke: var(--mat-sys-primary);
    }
  `,
})
export class BeforeAfterComponent {
  private readonly transloco = inject(TranslocoService);

  protected readonly weekOptions = BEFORE_AFTER_WEEKS;
  protected readonly minDays = MIN_WINDOW_DAYS;
  protected readonly chartSize = CHART;
  protected readonly weeks = signal<number>(4);
  protected readonly chosen = signal<string | null>(null);
  protected readonly showAll = signal(false);

  protected readonly data = httpResource<BeforeAfter>(() => CORE_READS.beforeAfter(this.weeks()));

  /** The chosen event, or the latest one. */
  protected readonly result = computed(() => {
    const results = this.data.value()?.results ?? [];
    return results.find((item) => item.event.id === this.chosen()) ?? results[0] ?? null;
  });
  protected readonly changed = computed(
    () => this.result()?.changes.filter((change) => change.changed) ?? [],
  );
  /** Every number compared, none with enough ordinary dates to tell a change from the usual. */
  protected readonly noHistory = computed(() => {
    const changes = this.result()?.changes ?? [];
    return changes.length > 0 && changes.every((change) => change.p === null);
  });
  protected readonly shown = computed(() =>
    this.showAll() ? (this.result()?.changes ?? []) : this.changed(),
  );

  protected name(change: BeforeAfterChange): string {
    return change.label ?? this.transloco.translate(change.labelKey);
  }

  protected format(change: BeforeAfterChange, value: number): string {
    return formatValue(change, value, this.transloco.getActiveLang(), (number) =>
      this.transloco.translate('life.hours', { value: number }),
    );
  }

  protected differenceText(change: BeforeAfterChange): string {
    if (change.differencePercent !== null) {
      return `${change.differencePercent > 0 ? '+' : ''}${change.differencePercent}%`;
    }
    const sign = change.difference > 0 ? '+' : '−';
    return `${sign}${this.format(change, Math.abs(change.difference))}`;
  }

  /** The days around the date as a line; the averages of the two sides over it. */
  protected chartOf(change: BeforeAfterChange, on: string): MiniChart | null {
    const values = change.values;
    if (values.length < 2) {
      return null;
    }
    const time = (day: string) => new Date(`${day}T00:00:00Z`).getTime();
    const [first, last] = [time(values[0].day), time(values[values.length - 1].day)];
    const numbers = values.map((item) => item.value);
    const [low, high] = [Math.min(...numbers), Math.max(...numbers)];
    const span = high - low || 1;
    const x = (day: string) =>
      CHART.pad + ((time(day) - first) / (last - first || 1)) * (CHART.width - 2 * CHART.pad);
    const y = (value: number) =>
      CHART.height - CHART.pad - ((value - low) / span) * (CHART.height - 2 * CHART.pad);
    const at = x(on);
    return {
      line: values
        .map(
          (item, index) =>
            `${index ? 'L' : 'M'}${x(item.day).toFixed(1)},${y(item.value).toFixed(1)}`,
        )
        .join(' '),
      at,
      before: { x1: CHART.pad, x2: at, y: y(change.before) },
      after: { x1: at, x2: CHART.width - CHART.pad, y: y(change.after) },
    };
  }
}
