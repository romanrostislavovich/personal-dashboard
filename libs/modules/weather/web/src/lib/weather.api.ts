import { httpResource } from '@angular/common/http';
import { inject, Injectable, Signal } from '@angular/core';
import { WEATHER_READS, weatherApi } from '@pd/client-core';
import { WeatherForecast, WeatherLocation, WeatherLocationInput } from '@pd/contracts';
import { DASHBOARD_CLIENT, fromCore } from '@pd/web-core';

/** The weather requests of the client core (`@pd/client-core`) for Angular. */
@Injectable({ providedIn: 'root' })
export class WeatherApi {
  private readonly weather = weatherApi(inject(DASHBOARD_CLIENT).api);

  /** Today's forecast; `null` until a location is chosen. Call it in a component field. */
  forecast() {
    return httpResource<WeatherForecast | null>(() => WEATHER_READS.forecast(), {
      defaultValue: null,
    });
  }

  /** Places matching the query; nothing is requested for less than 2 characters. */
  places(query: Signal<string>) {
    return httpResource<WeatherLocation[]>(
      () => {
        const q = query().trim();
        return q.length >= 2 ? WEATHER_READS.places(q) : undefined;
      },
      { defaultValue: [] },
    );
  }

  /** The place at the browser's location. */
  placeAt(latitude: number, longitude: number) {
    return fromCore(() => this.weather.placeAt(latitude, longitude));
  }

  setLocation(input: WeatherLocationInput) {
    return fromCore(() => this.weather.setLocation(input));
  }
}
