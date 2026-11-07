import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {RouterLink} from '@angular/router';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  DailyMetric,
  DEFAULT_FORECAST_TARGETS,
  ForecastDriver,
  LinksForecast,
  PastForecast,
} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {formatValue, moduleColor} from './links-format';

/** The kept forecasts of a target worth a "how close" line: fewer say nothing. */
const MIN_PAST = 3;

interface Shown {
  forecast: LinksForecast;
  /** How much closer than the plain guess, percent. */
  better: number;
  /** The kept trusted forecasts with what the days were: their mean miss and how many. */
  past: {miss: number; days: number} | null;
  /** Yesterday's kept forecast of it and what the day was. */
  yesterday: PastForecast | null;
}

/**
 * Forecasts of the numbers: the bedtime, deep work, tasks done, the mood and the numbers the
 * user chose, each by a model of their own days, with what drove it and how close the kept
 * ones came. One that does not beat the plain guess is shown grey here and never on Home (the
 * widget, `compact`).
 */
@Component({
  selector: 'pd-forecasts-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
  ],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        @if (!compact()) {
          <mat-icon mat-card-avatar>online_prediction</mat-icon>
        }
        <mat-card-title>{{
          'life.forecasts.title' | transloco
        }}</mat-card-title>
        @if (!compact()) {
          <mat-card-subtitle>{{
            'life.forecasts.hint' | transloco
          }}</mat-card-subtitle>
        }
      </mat-card-header>
      <mat-card-content>
        @if (data.error()) {
          <p class="muted">{{ 'life.forecasts.failed' | transloco }}</p>
        } @else if (data.hasValue()) {
          @for (group of groups(); track group.day) {
            <h3 class="day">
              {{
                (group.made === 'morning'
                  ? 'life.forecasts.today'
                  : 'life.forecasts.tomorrow'
                ) | transloco
              }}
            </h3>
            @if (group.shown.length) {
              <ul class="forecasts">
                @for (item of group.shown; track item.forecast.key) {
                  <li [class.weak]="!item.forecast.trusted">
                    <span
                      class="dot"
                      [style.background]="color(item.forecast)"
                      aria-hidden="true"
                    ></span>
                    <span class="name">{{ name(item.forecast) }}</span>
                    <span class="value">
                      @if (item.forecast.value !== null) {
                        ~{{ value(item.forecast, item.forecast.value) }}
                      }
                    </span>
                    <span class="muted line">
                      @if (item.forecast.value === null) {
                        {{
                          'life.forecasts.few'
                            | transloco: {days: item.forecast.days}
                        }}
                      } @else if (!item.forecast.trusted) {
                        {{ 'life.forecasts.notBetter' | transloco }}
                      } @else {
                        {{
                          'life.forecasts.miss'
                            | transloco
                              : {
                                  miss: amount(
                                    item.forecast,
                                    item.forecast.error ?? 0
                                  ),
                                  better: item.better,
                                }
                        }}
                      }
                      @if (!compact() && item.yesterday?.actual !== null) {
                        @if (item.yesterday; as kept) {
                          ·
                          {{
                            'life.forecasts.yesterday'
                              | transloco
                                : {
                                    value: value(item.forecast, kept.value),
                                    actual: value(
                                      item.forecast,
                                      kept.actual ?? 0
                                    ),
                                  }
                          }}
                        }
                      }
                      @if (!compact() && item.past) {
                        ·
                        {{
                          'life.forecasts.past'
                            | transloco
                              : {
                                  miss: amount(item.forecast, item.past.miss),
                                  days: item.past.days,
                                }
                        }}
                      }
                    </span>
                    @if (
                      !compact() &&
                      item.forecast.value !== null &&
                      item.forecast.drivers.length
                    ) {
                      <button
                        matButton
                        type="button"
                        class="why"
                        [attr.aria-expanded]="isOpen(item.forecast)"
                        (click)="toggle(item.forecast)"
                      >
                        {{ 'life.forecasts.why' | transloco }}
                      </button>
                      @if (isOpen(item.forecast)) {
                        <ul class="drivers">
                          @for (
                            driver of item.forecast.drivers;
                            track driver.key
                          ) {
                            <li>
                              <span>
                                {{ driverName(driver) }}
                                @if (
                                  driver.value !== null &&
                                  driver.key !== 'self.weekend'
                                ) {
                                  <span class="muted">
                                    ({{ value(driver, driver.value) }})
                                  </span>
                                }
                              </span>
                              <b>
                                {{ driver.effect > 0 ? '↑' : '↓' }}
                                {{ amount(item.forecast, driver.effect) }}
                              </b>
                            </li>
                          }
                        </ul>
                      }
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="muted">{{ 'life.forecasts.none' | transloco }}</p>
            }
          }
          @if (!compact()) {
            <mat-form-field class="targets" subscriptSizing="dynamic">
              <mat-label>{{ 'life.forecasts.choose' | transloco }}</mat-label>
              <mat-select
                multiple
                [value]="chosen()"
                (selectionChange)="choose($event.value)"
              >
                @for (option of options(); track option.key) {
                  <mat-option [value]="option.key">{{
                    option.label ?? (option.labelKey | transloco)
                  }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        }
      </mat-card-content>
      @if (compact()) {
        <mat-card-actions align="end">
          <a matButton routerLink="/life/links">{{
            'life.links.unusual.open' | transloco
          }}</a>
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
    }
    .day {
      margin: 12px 0 4px;
      font: var(--mat-sys-title-small);
    }
    .forecasts {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
    .forecasts > li {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto;
      gap: 2px 8px;
      align-items: baseline;
    }
    .weak {
      opacity: 0.6;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .name {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .value {
      font: var(--mat-sys-title-small);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .line,
    .why,
    .drivers {
      grid-column: 2 / -1;
    }
    .why {
      justify-self: start;
    }
    .drivers {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .drivers li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0;
      border-bottom: 1px solid var(--pd-border);
    }
    .drivers b {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .targets {
      width: 100%;
      margin-top: 16px;
    }
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class ForecastsCardComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  /** The Home widget: the trusted forecasts only, no explanations. */
  readonly compact = input(false);

  protected readonly data = this.api.forecasts();
  private readonly open = signal<string | null>(null);

  protected readonly groups = computed(() => {
    if (!this.data.hasValue()) {
      return [];
    }
    const {forecasts, past, today} = this.data.value();
    const yesterday = shiftDay(today, -1);
    const days = [...new Set(forecasts.map(one => one.day))].sort();
    return days.map(day => {
      const ofDay = forecasts.filter(one => one.day === day);
      const shown: Shown[] = ofDay
        .filter(one => !this.compact() || (one.trusted && one.value !== null))
        .map(forecast => {
          const kept = past.filter(
            one =>
              one.key === forecast.key && one.trusted && one.actual !== null,
          );
          return {
            forecast,
            better:
              forecast.error !== null && forecast.baselineError
                ? Math.round(
                    (1 - forecast.error / forecast.baselineError) * 100,
                  )
                : 0,
            past:
              kept.length >= MIN_PAST
                ? {
                    miss:
                      kept.reduce(
                        (sum, one) =>
                          sum + Math.abs(one.value - (one.actual as number)),
                        0,
                      ) / kept.length,
                    days: kept.length,
                  }
                : null,
            yesterday:
              past.find(
                one =>
                  one.key === forecast.key &&
                  one.day === yesterday &&
                  one.made === 'morning',
              ) ?? null,
          };
        });
      return {day, made: ofDay[0].made, shown};
    });
  });

  /** The chosen targets beyond the default ones. */
  protected readonly chosen = computed(() =>
    this.data.hasValue()
      ? this.data
          .value()
          .targets.filter(
            key =>
              !(DEFAULT_FORECAST_TARGETS as readonly string[]).includes(key),
          )
      : [],
  );

  /** What may be chosen: the chosen ones and the other main numbers. */
  protected readonly options = computed(() => {
    if (!this.data.hasValue()) {
      return [];
    }
    const {forecasts, candidates} = this.data.value();
    const chosen = this.chosen();
    const current = forecasts.filter(
      (one, index, all) =>
        chosen.includes(one.key) &&
        all.findIndex(other => other.key === one.key) === index,
    );
    return [...current, ...candidates];
  });

  protected choose(targets: string[]): void {
    this.api
      .setForecastTargets(targets)
      .subscribe({next: () => this.data.reload()});
  }

  protected isOpen(forecast: LinksForecast): boolean {
    return this.open() === `${forecast.key}|${forecast.day}`;
  }

  /** Opens what drove a forecast; opening one is counted (for the achievements of exploring). */
  protected toggle(forecast: LinksForecast): void {
    const key = `${forecast.key}|${forecast.day}`;
    if (this.open() === key) {
      this.open.set(null);
      return;
    }
    this.open.set(key);
    this.api.seen({kind: 'forecast', key}).subscribe({error: () => undefined});
  }

  protected name(forecast: LinksForecast): string {
    return forecast.label ?? this.transloco.translate(forecast.labelKey);
  }

  protected driverName(driver: ForecastDriver): string {
    return driver.label ?? this.transloco.translate(driver.labelKey);
  }

  protected color(forecast: LinksForecast): string {
    return moduleColor(forecast.module);
  }

  protected value(
    metric: Pick<DailyMetric, 'unit' | 'currency'>,
    value: number,
  ): string {
    return formatValue(metric, value, this.transloco.getActiveLang(), hours =>
      this.transloco.translate('life.hours', {value: hours}),
    );
  }

  /**
   * A difference in the target's unit: of a time (the bedtime) or hours in minutes when under
   * an hour, else like the value itself.
   */
  protected amount(forecast: LinksForecast, value: number): string {
    const size = Math.abs(value);
    if ((forecast.unit === 'clock' || forecast.unit === 'hours') && size < 1) {
      return this.transloco.translate('life.forecasts.minutes', {
        value: Math.round(size * 60),
      });
    }
    return this.value(
      forecast.unit === 'clock' ? {unit: 'hours'} : forecast,
      size,
    );
  }
}

function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}
