import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { WeatherForecast, WeatherLocation, WeatherLocationInput } from '@pd/contracts';

@Injectable({ providedIn: 'root' })
export class WeatherApi {
  private readonly http = inject(HttpClient);

  /** Today's forecast; `null` until a location is chosen. Call it in a component field. */
  forecast() {
    return httpResource<WeatherForecast | null>(() => '/api/weather', { defaultValue: null });
  }

  /** Places matching the query; nothing is requested for less than 2 characters. */
  places(query: Signal<string>) {
    return httpResource<WeatherLocation[]>(
      () => {
        const q = query().trim();
        return q.length >= 2 ? { url: '/api/weather/places', params: { q } } : undefined;
      },
      { defaultValue: [] },
    );
  }

  setLocation(input: WeatherLocationInput) {
    return this.http.put<WeatherLocation>('/api/weather/location', input);
  }
}
