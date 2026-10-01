import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { THERMAL_FEELS, ThermalFeel, WeatherLocation } from '@pd/contracts';
import { ClothingAdviceComponent } from './clothing-advice.component';
import { LocationPickerComponent } from './location-picker.component';
import { WeatherApi } from './weather.api';
import { WeatherLocator } from './weather-locator';
import { conditionEmoji, isDaytime } from './weather-emoji';

@Component({
  selector: 'pd-weather-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    ClothingAdviceComponent,
    LocationPickerComponent,
  ],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'weather.title' | transloco }}</h1>
      <div class="where">
        <pd-location-picker (chosen)="setLocation($event)" />
        <button matButton type="button" [disabled]="locating()" (click)="useMyLocation()">
          <mat-icon>my_location</mat-icon> {{ 'weather.myLocation' | transloco }}
        </button>
      </div>
    </header>
    @if (locateFailed()) {
      <p class="locate-failed">{{ 'weather.locateFailed' | transloco }}</p>
    }

    @if (forecast.value(); as weather) {
      <div class="top">
        <mat-card appearance="outlined" class="now">
          <mat-card-content>
            <p class="place">📍 {{ weather.location.name }}</p>
            <div class="current">
              <span class="icon">{{ emoji(weather.now.condition, weather.now.isDay) }}</span>
              <span class="temperature">{{ weather.now.temperature }}°</span>
            </div>
            <p>
              {{ 'weather.condition.' + weather.now.condition | transloco }} ·
              {{ 'weather.feelsLike' | transloco: { value: weather.now.apparentTemperature } }}
            </p>
            <p class="range">
              {{ 'weather.range' | transloco: { min: weather.today.min, max: weather.today.max } }}
            </p>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'weather.whatToWear' | transloco }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <pd-clothing-advice [advice]="weather.clothing" />
            <!-- The advice is for an average person until the user says how they take the cold. -->
            <mat-form-field subscriptSizing="dynamic" class="thermal">
              <mat-label>{{ 'weather.thermal.label' | transloco }}</mat-label>
              <mat-select
                [value]="weather.thermalFeel"
                (selectionChange)="setThermalFeel($event.value)"
              >
                @for (feel of thermalFeels; track feel) {
                  <mat-option [value]="feel">{{
                    'weather.thermal.' + feel | transloco
                  }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </mat-card-content>
        </mat-card>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="label">{{ 'weather.precipitation' | transloco }}</span>
          <span class="value">
            {{ weather.today.precipitationProbability }}% · {{ weather.today.precipitation }}
            {{ 'weather.mm' | transloco }}
          </span>
        </div>
        <div class="stat">
          <span class="label">{{ 'weather.wind' | transloco }}</span>
          <span class="value">
            {{ weather.today.windSpeedMax }} {{ 'weather.kmh' | transloco }}
          </span>
        </div>
        <div class="stat">
          <span class="label">{{ 'weather.uv' | transloco }}</span>
          <span class="value">{{ weather.today.uvIndexMax }}</span>
        </div>
        <div class="stat">
          <span class="label">{{ 'weather.sun' | transloco }}</span>
          <span class="value">🌅 {{ weather.today.sunrise }} · 🌇 {{ weather.today.sunset }}</span>
        </div>
      </div>

      <h2 class="section-title">{{ 'weather.hourly' | transloco }}</h2>
      <div class="hours">
        @for (hour of weather.hours; track hour.time) {
          <div class="hour">
            <span class="time">{{ hour.time }}</span>
            <span class="icon">
              {{
                emoji(hour.condition, day(hour.time, weather.today.sunrise, weather.today.sunset))
              }}
            </span>
            <span class="value">{{ hour.temperature }}°</span>
            <span class="rain">💧 {{ hour.precipitationProbability }}%</span>
          </div>
        }
      </div>

      <h2 class="section-title week-title">{{ 'weather.week' | transloco }}</h2>
      <div class="week">
        @for (d of weather.days; track d.date) {
          <div class="day" [class.today]="d.date === weather.today.date">
            <span class="weekday">
              {{
                d.date === weather.today.date
                  ? ('weather.today' | transloco)
                  : (d.date | date: 'EEE, d MMM')
              }}
            </span>
            <span class="icon" [matTooltip]="'weather.condition.' + d.condition | transloco">
              {{ emoji(d.condition, true) }}
            </span>
            <span class="value"
              >{{ d.max }}° <span class="low">{{ d.min }}°</span></span
            >
            <span class="rain">
              💧 {{ d.precipitationProbability }}%
              @if (d.precipitation > 0) {
                · {{ d.precipitation }} {{ 'weather.mm' | transloco }}
              }
            </span>
            <span class="wear" [matTooltip]="'weather.outfit.' + d.clothing.outfit | transloco">
              👕 {{ 'weather.outfitShort.' + d.clothing.outfit | transloco }}
            </span>
          </div>
        }
      </div>
    } @else if (forecast.error()) {
      <p class="empty">{{ 'weather.error' | transloco }}</p>
    } @else if (!forecast.isLoading()) {
      <p class="empty">{{ 'weather.noLocation' | transloco }}</p>
    }
  `,
  styles: `
    .where {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .locate-failed {
      margin: -8px 0 16px;
      color: var(--mat-sys-error);
    }
    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
      gap: 12px;
      margin-bottom: 12px;
    }
    @media (max-width: 800px) {
      .top {
        grid-template-columns: 1fr;
      }
    }
    .now p {
      margin: 4px 0;
    }
    .place {
      font-weight: 600;
    }
    .current {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .current .icon {
      font-size: 3rem;
    }
    .temperature {
      font: 800 3.5rem / 1 var(--pd-font-heading);
    }
    .range {
      color: var(--mat-sys-on-surface-variant);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 16px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius);
      background: var(--pd-card);
    }
    .label {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      font-weight: 700;
    }
    .section-title {
      font: 700 1.1rem / 1.3 var(--pd-font-heading);
      margin: 0 0 12px;
    }
    .hours {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 8px;
    }
    .hour {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 64px;
      padding: 10px 6px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius-small);
      background: var(--pd-card);
    }
    .hour .icon {
      font-size: 1.4rem;
    }
    .time,
    .rain {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .thermal {
      width: min(100%, 320px);
      margin-top: 16px;
    }
    .week-title {
      margin-top: 24px;
    }
    .week {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 8px;
    }
    .day {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px;
      border: 1px solid var(--pd-border);
      border-radius: var(--pd-radius-small);
      background: var(--pd-card);
    }
    .day.today {
      border-color: var(--mat-sys-primary);
    }
    .weekday {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant);
      text-transform: capitalize;
    }
    .day .icon {
      font-size: 1.6rem;
    }
    .low {
      font-weight: 400;
      color: var(--mat-sys-on-surface-variant);
    }
    .wear {
      font-size: 0.8rem;
    }
  `,
})
export class WeatherPage {
  private readonly api = inject(WeatherApi);
  private readonly locator = inject(WeatherLocator);
  protected readonly forecast = this.api.forecast();
  protected readonly emoji = conditionEmoji;
  protected readonly day = isDaytime;
  protected readonly thermalFeels = THERMAL_FEELS;
  protected readonly locating = signal(false);
  protected readonly locateFailed = signal(false);

  constructor() {
    // No city yet: take the browser's location (once per browser, the browser asks first).
    effect(() => {
      if (this.forecast.status() === 'resolved' && this.forecast.value() === null) {
        void this.locator.detectOnce().then((place) => place && this.forecast.reload());
      }
    });
  }

  protected setLocation(location: WeatherLocation): void {
    this.locateFailed.set(false);
    this.api.setLocation(location).subscribe(() => this.forecast.reload());
  }

  /** The advice of every day is recomputed for the new scale. */
  protected setThermalFeel(thermalFeel: ThermalFeel): void {
    this.api.setPreferences({ thermalFeel }).subscribe(() => this.forecast.reload());
  }

  protected async useMyLocation(): Promise<void> {
    this.locating.set(true);
    this.locateFailed.set(false);
    try {
      const place = await this.locator.detect();
      this.locateFailed.set(!place);
      if (place) {
        this.forecast.reload();
      }
    } catch {
      this.locateFailed.set(true);
    } finally {
      this.locating.set(false);
    }
  }
}
