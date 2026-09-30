import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ClothingAdviceComponent } from './clothing-advice.component';
import { WeatherApi } from './weather.api';
import { WeatherLocator } from './weather-locator';
import { conditionEmoji } from './weather-emoji';

/** Home widget: the weather now and what to wear. */
@Component({
  selector: 'pd-weather-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatButtonModule, TranslocoPipe, ClothingAdviceComponent],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-card-title>🌤️ {{ 'weather.title' | transloco }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (forecast.value(); as weather) {
          <div class="current">
            <span class="icon">{{ emoji(weather.now.condition, weather.now.isDay) }}</span>
            <span class="temperature">{{ weather.now.temperature }}°</span>
            <span class="details">
              <span class="place">{{ weather.location.name }}</span>
              <span>
                {{
                  'weather.range' | transloco: { min: weather.today.min, max: weather.today.max }
                }}
                · 💧 {{ weather.today.precipitationProbability }}%
              </span>
            </span>
          </div>
          <pd-clothing-advice [advice]="weather.clothing" />
        } @else if (forecast.error()) {
          <p class="empty">{{ 'weather.error' | transloco }}</p>
        } @else if (!forecast.isLoading()) {
          <p class="empty">{{ 'weather.widget.noLocation' | transloco }}</p>
        }
      </mat-card-content>
      <mat-card-actions align="end">
        <a matButton routerLink="/weather">{{ 'weather.widget.open' | transloco }}</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: `
    .current {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .icon {
      font-size: 2.2rem;
    }
    .temperature {
      font: 800 2.2rem / 1 var(--pd-font-heading);
    }
    .details {
      display: flex;
      flex-direction: column;
      font-size: 0.85rem;
      color: var(--mat-sys-on-surface-variant);
    }
    .place {
      font-weight: 600;
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class WeatherWidget {
  protected readonly forecast = inject(WeatherApi).forecast();
  protected readonly emoji = conditionEmoji;

  constructor() {
    const locator = inject(WeatherLocator);
    // No city yet: take the browser's location (once per browser, the browser asks first).
    effect(() => {
      if (this.forecast.status() === 'resolved' && this.forecast.value() === null) {
        void locator.detectOnce().then((place) => place && this.forecast.reload());
      }
    });
  }
}
