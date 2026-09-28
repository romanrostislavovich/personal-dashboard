import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { TranslocoPipe } from '@jsverse/transloco';
import { WeatherLocation } from '@pd/contracts';
import { ClothingAdviceComponent } from './clothing-advice.component';
import { LocationPickerComponent } from './location-picker.component';
import { WeatherApi } from './weather.api';
import { conditionEmoji, isDaytime } from './weather-emoji';

@Component({
  selector: 'pd-weather-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, TranslocoPipe, ClothingAdviceComponent, LocationPickerComponent],
  template: `
    <header class="page-header">
      <h1 class="page-title">{{ 'weather.title' | transloco }}</h1>
      <pd-location-picker (chosen)="setLocation($event)" />
    </header>

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
    } @else if (forecast.error()) {
      <p class="empty">{{ 'weather.error' | transloco }}</p>
    } @else if (!forecast.isLoading()) {
      <p class="empty">{{ 'weather.noLocation' | transloco }}</p>
    }
  `,
  styles: `
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
  `,
})
export class WeatherPage {
  private readonly api = inject(WeatherApi);
  protected readonly forecast = this.api.forecast();
  protected readonly emoji = conditionEmoji;
  protected readonly day = isDaytime;

  protected setLocation(location: WeatherLocation): void {
    this.api.setLocation(location).subscribe(() => this.forecast.reload());
  }
}
