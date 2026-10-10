import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Bar, BarChartComponent, SparklineComponent, SparklinePoint } from '@pd/web-core';
import { localDate, PsychologyApi } from './psychology.api';

const PERIODS = [90, 180, 365] as const;

/**
 * The mood over time: its average, the days of the week, week by week, the longest run of low
 * days and the mood during the events of a life. The mood itself is marked in the diary.
 */
@Component({
  selector: 'pd-psychology-patterns-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    RouterLink,
    TranslocoPipe,
    BarChartComponent,
    SparklineComponent,
  ],
  template: `
    <header class="toolbar">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        [value]="days()"
        [attr.aria-label]="'psychology.period' | transloco"
        (change)="days.set($event.value)"
      >
        @for (option of periods; track option) {
          <mat-button-toggle [value]="option">
            {{ 'psychology.days' | transloco: { days: option } }}
          </mat-button-toggle>
        }
      </mat-button-toggle-group>
      <a matButton routerLink="/life/summary">
        <mat-icon>insights</mat-icon> {{ 'psychology.patterns.whatGoesWith' | transloco }}
      </a>
    </header>

    @if (patterns.value(); as data) {
      @if (!data.days) {
        <p class="hint">{{ 'psychology.patterns.empty' | transloco }}</p>
      } @else {
        <mat-card appearance="outlined">
          <mat-card-content class="stats">
            <div class="stat">
              <span class="label">{{ 'psychology.patterns.average' | transloco }}</span>
              <span class="value">{{ data.average | number: '1.1-1' }}</span>
              <span class="sub">{{ 'psychology.patterns.ofFive' | transloco }}</span>
            </div>
            <div class="stat">
              <span class="label">{{ 'psychology.patterns.daysWithMood' | transloco }}</span>
              <span class="value">{{ data.days }}</span>
            </div>
            <div class="stat">
              <span class="label">{{ 'psychology.patterns.bestDay' | transloco }}</span>
              <span class="value">{{ best() }}</span>
            </div>
            <div class="stat">
              <span class="label">{{ 'psychology.patterns.hardestDay' | transloco }}</span>
              <span class="value">{{ hardest() }}</span>
            </div>
            @if (data.longestLowRun; as run) {
              <div class="stat">
                <span class="label">{{ 'psychology.patterns.lowRun' | transloco }}</span>
                <span class="value">
                  {{ 'psychology.patterns.runDays' | transloco: { days: run.days } }}
                </span>
                <span class="sub">
                  {{
                    'psychology.patterns.since' | transloco: { date: (run.from | date: 'd MMM y') }
                  }}
                </span>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <div class="columns">
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'psychology.patterns.byWeekday' | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content class="padded">
              <pd-bar-chart
                [bars]="weekdays()"
                [label]="'psychology.patterns.byWeekday' | transloco"
              />
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'psychology.patterns.byWeek' | transloco }}</mat-card-title>
            </mat-card-header>
            <mat-card-content class="padded">
              @if (weeks().length > 1) {
                <pd-sparkline
                  [points]="weeks()"
                  dateFormat="d MMM y"
                  [label]="'psychology.patterns.byWeek' | transloco"
                />
              } @else {
                <p class="hint">{{ 'psychology.patterns.fewWeeks' | transloco }}</p>
              }
            </mat-card-content>
          </mat-card>
        </div>

        @if (data.events.length) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ 'psychology.patterns.duringEvents' | transloco }}</mat-card-title>
              <mat-card-subtitle>
                {{ 'psychology.patterns.duringEventsHint' | transloco }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @for (event of data.events; track event.id) {
                <div class="event">
                  <span class="what">
                    <b>{{ event.title }}</b>
                    <span class="hint">
                      {{ event.from | date: 'd MMM y' }}
                      @if (event.to !== event.from) {
                        – {{ event.to | date: 'd MMM y' }}
                      }
                    </span>
                  </span>
                  <span
                    class="mood"
                    [class.low]="event.mood !== null && event.mood < (data.average ?? 0) - 0.3"
                    [class.high]="event.mood !== null && event.mood > (data.average ?? 0) + 0.3"
                  >
                    {{ event.mood === null ? '—' : (event.mood | number: '1.1-1') }}
                  </span>
                </div>
              }
            </mat-card-content>
          </mat-card>
        }
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .hint,
    .sub {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      padding-top: 16px;
    }
    .stat {
      display: flex;
      flex-direction: column;
    }
    .label {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font: var(--mat-sys-headline-small);
    }
    .padded {
      padding-top: 12px;
    }
    .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
      align-items: start;
      gap: 16px;
    }
    .event {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      border-top: 1px solid var(--pd-border);
    }
    .what {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .mood {
      font: var(--mat-sys-title-medium);
      font-variant-numeric: tabular-nums;
    }
    .mood.low {
      color: var(--mat-sys-error);
    }
    .mood.high {
      color: var(--pd-success);
    }
  `,
})
export class PatternsPage {
  private readonly api = inject(PsychologyApi);
  private readonly transloco = inject(TranslocoService);

  protected readonly periods = PERIODS;
  protected readonly days = signal<number>(PERIODS[0]);
  private readonly period = computed(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - this.days() + 1);
    return { from: localDate(from), to: localDate(to) };
  });
  protected readonly patterns = this.api.patterns(this.period);

  private readonly weekdayName = (weekday: number) =>
    this.transloco.translate(`psychology.weekdays.${weekday}`);

  protected readonly weekdays = computed<Bar[]>(() =>
    (this.patterns.value()?.byWeekday ?? []).map(({ weekday, average, days }) => ({
      label: this.weekdayName(weekday),
      value: average ?? 0,
      title: `${this.weekdayName(weekday)}: ${average ?? '—'} (${days})`,
    })),
  );
  protected readonly weeks = computed<SparklinePoint[]>(() =>
    (this.patterns.value()?.weeks ?? []).map(({ week, average }) => ({ at: week, value: average })),
  );

  /** The day of the week with the highest and the lowest mood, among those that have one. */
  private readonly ranked = computed(() =>
    (this.patterns.value()?.byWeekday ?? [])
      .filter((item) => item.average !== null)
      .sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
  );
  protected readonly best = computed(() => {
    const [first] = this.ranked();
    return first ? this.weekdayName(first.weekday) : '—';
  });
  protected readonly hardest = computed(() => {
    const last = this.ranked().at(-1);
    return last && this.ranked().length > 1 ? this.weekdayName(last.weekday) : '—';
  });
}
