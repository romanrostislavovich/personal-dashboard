import { inject, Injectable } from '@angular/core';
import { WeatherLocation } from '@pd/contracts';
import { firstValueFrom } from 'rxjs';
import { WeatherApi } from './weather.api';

/** Remembered per browser: the automatic attempt (and a refusal) happens once. */
const AUTO_TRIED_KEY = 'pd.weather.autoLocated';
/** A city is enough: a coarse, cached position answers faster and drains less battery. */
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60 * 60 * 1000,
  timeout: 15_000,
};

/**
 * The user's city from the browser's location: the default until a city is chosen by hand.
 * The browser asks for permission; without it (or in the desktop app, which has no location
 * service) the city is simply chosen in the search as before.
 */
@Injectable({ providedIn: 'root' })
export class WeatherLocator {
  private readonly api = inject(WeatherApi);
  private detecting: Promise<WeatherLocation | null> | null = null;

  /** Detects and saves the location once per browser; `null` — not detected. */
  detectOnce(): Promise<WeatherLocation | null> {
    if (readFlag()) {
      return Promise.resolve(null);
    }
    writeFlag();
    return this.detect();
  }

  /** Detects and saves the location now (the "my location" button). */
  detect(): Promise<WeatherLocation | null> {
    // The page and the home widget may ask at the same moment: one prompt, one request.
    this.detecting ??= this.locate().finally(() => (this.detecting = null));
    return this.detecting;
  }

  private async locate(): Promise<WeatherLocation | null> {
    const position = await currentPosition();
    if (!position) {
      return null;
    }
    const { latitude, longitude } = position.coords;
    try {
      const place = await firstValueFrom(this.api.placeAt(latitude, longitude));
      return await firstValueFrom(this.api.setLocation(place));
    } catch {
      return null; // Naming the place failed: the city can still be found in the search.
    }
  }
}

function currentPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), POSITION_OPTIONS),
  );
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(AUTO_TRIED_KEY) !== null;
  } catch {
    return false;
  }
}

function writeFlag(): void {
  try {
    localStorage.setItem(AUTO_TRIED_KEY, new Date().toISOString());
  } catch {
    // Storage is unavailable (private mode): the browser may ask again next time.
  }
}
