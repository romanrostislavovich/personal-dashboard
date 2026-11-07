import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {DailyMetric, ForecastDriver, LinksForecast} from '@pd/contracts';
import {LifeApi} from '../life.api';
import {ForecastItem} from './forecast-groups';
import {formatValue, moduleColor} from './links-format';

/**
 * One forecast of the card: the number, how close the model comes, how close the kept ones
 * came, and on a button what drove it (opening it is counted, for the achievements).
 */
@Component({
  selector: 'pd-forecast-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, TranslocoPipe],
  template: `
    @let forecast = item().forecast;
    <span
      class="dot"
      [style.background]="color(forecast)"
      aria-hidden="true"
    ></span>
    <span class="name">{{ name(forecast) }}</span>
    <span class="value">
      @if (forecast.value !== null) {
        ~{{ shown(forecast, forecast.value) }}
      }
    </span>
    <span class="muted line">
      @if (forecast.value === null) {
        {{ 'life.forecasts.few' | transloco: {days: forecast.days} }}
      } @else if (!forecast.trusted) {
        {{ 'life.forecasts.notBetter' | transloco }}
      } @else {
        {{
          'life.forecasts.miss'
            | transloco
              : {
                  miss: amount(forecast, forecast.error ?? 0),
                  better: item().better,
                }
        }}
      }
      @if (!compact()) {
        @if (item().yesterday; as kept) {
          ·
          {{
            'life.forecasts.yesterday'
              | transloco
                : {
                    value: shown(forecast, kept.value),
                    actual: shown(forecast, kept.actual),
                  }
          }}
        }
        @if (item().past; as past) {
          ·
          {{
            'life.forecasts.past'
              | transloco: {miss: amount(forecast, past.miss), days: past.days}
          }}
        }
      }
    </span>
    @if (!compact() && forecast.value !== null && forecast.drivers.length) {
      <button
        matButton
        type="button"
        class="why"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        {{ 'life.forecasts.why' | transloco }}
      </button>
      @if (open()) {
        <ul class="drivers">
          @for (driver of forecast.drivers; track driver.key) {
            <li>
              <span>
                {{ driverName(driver) }}
                @if (driver.value !== null && driver.key !== 'self.weekend') {
                  <span class="muted">({{ value(driver, driver.value) }})</span>
                }
              </span>
              <b
                [attr.aria-label]="
                  (driver.effect > 0
                    ? 'life.forecasts.up'
                    : 'life.forecasts.down'
                  ) | transloco: {value: amount(forecast, driver.effect)}
                "
              >
                {{ driver.effect > 0 ? '↑' : '↓' }}
                {{ amount(forecast, driver.effect) }}
              </b>
            </li>
          }
        </ul>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto;
      gap: 2px 8px;
      align-items: baseline;
    }
    :host(.weak) .name,
    :host(.weak) .value {
      color: var(--mat-sys-on-surface-variant);
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
    .muted {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  host: {'[class.weak]': '!item().forecast.trusted'},
})
export class ForecastRowComponent {
  private readonly api = inject(LifeApi);
  private readonly transloco = inject(TranslocoService);

  readonly item = input.required<ForecastItem>();
  /** On Home: no kept lines, no explanations. */
  readonly compact = input(false);

  protected readonly open = signal(false);

  /** Opens what drove the forecast; opening is counted (for the achievements of exploring). */
  protected toggle(): void {
    const opening = !this.open();
    this.open.set(opening);
    if (opening) {
      const {key, day} = this.item().forecast;
      this.api
        .seen({kind: 'forecast', key: `${key}|${day}`})
        .subscribe({error: () => undefined});
    }
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

  /** The forecast's own number: a count whole ("~2 tasks", not "~1.6"). */
  protected shown(forecast: LinksForecast, value: number): string {
    return this.value(
      forecast,
      forecast.unit === 'count' ? Math.round(value) : value,
    );
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
   * A difference in the forecast's unit: of a time (the bedtime) or hours in minutes when under
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
