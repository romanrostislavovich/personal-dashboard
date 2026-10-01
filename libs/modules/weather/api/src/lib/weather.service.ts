import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, UsersService } from '@pd/api-core';
import { ThermalFeel, WeatherForecast, WeatherLocation, WeatherLocationInput } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { toForecast } from './forecast';
import { NominatimClient } from './nominatim.client';
import { OpenMeteoClient, RawForecast } from './open-meteo.client';
import { weatherLocations, weatherSettings } from './weather.schema';

/** Forecasts update hourly; a page, a widget and the digest opened together share one request. */
const CACHE_MS = 15 * 60 * 1000;

/**
 * The user's location and the forecast for it: today in detail and the week ahead. Only reads from Open-Meteo and writes nothing,
 * so a sync client calls it directly instead of going through the server.
 */
@Injectable()
export class WeatherService {
  private readonly client = new OpenMeteoClient();
  private readonly nominatim = new NominatimClient();
  private readonly cache = new Map<string, { at: number; raw: RawForecast }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  async location(userId: string): Promise<WeatherLocation | null> {
    const [row] = await this.db
      .select()
      .from(weatherLocations)
      .where(eq(weatherLocations.userId, userId));
    if (!row) {
      return null;
    }
    const { name, region, country, latitude, longitude } = row;
    return { name, region, country, latitude, longitude };
  }

  async setLocation(userId: string, input: WeatherLocationInput): Promise<WeatherLocation> {
    const location: WeatherLocation = {
      name: input.name,
      region: input.region ?? null,
      country: input.country ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
    };
    await this.db
      .insert(weatherLocations)
      .values({ userId, ...location })
      .onConflictDoUpdate({
        target: weatherLocations.userId,
        set: { ...location, updatedAt: new Date() },
      });
    return location;
  }

  async clearLocation(userId: string): Promise<void> {
    await this.db.delete(weatherLocations).where(eq(weatherLocations.userId, userId));
  }

  /** The forecast for the user's location; `null` until they choose one. */
  async forecast(userId: string): Promise<WeatherForecast | null> {
    const location = await this.location(userId);
    if (!location) {
      return null;
    }
    return toForecast(await this.rawForecast(location), location, await this.thermalFeel(userId));
  }

  /** How the user takes the cold; "as most people" until they say otherwise. */
  async thermalFeel(userId: string): Promise<ThermalFeel> {
    const [row] = await this.db
      .select()
      .from(weatherSettings)
      .where(eq(weatherSettings.userId, userId));
    return row?.thermalFeel ?? 0;
  }

  async setThermalFeel(userId: string, thermalFeel: ThermalFeel): Promise<void> {
    await this.db
      .insert(weatherSettings)
      .values({ userId, thermalFeel })
      .onConflictDoUpdate({ target: weatherSettings.userId, set: { thermalFeel } });
  }

  /** Places by name, in the user's language. */
  async search(userId: string, query: string): Promise<WeatherLocation[]> {
    const locale = (await this.users.findById(userId))?.locale ?? 'en';
    return this.client.search(query, locale);
  }

  /** The place at the coordinates (the browser's location), named in the user's language. */
  async placeAt(userId: string, latitude: number, longitude: number): Promise<WeatherLocation> {
    const locale = (await this.users.findById(userId))?.locale ?? 'en';
    return this.nominatim.placeAt(latitude, longitude, locale);
  }

  private async rawForecast({ latitude, longitude }: WeatherLocation): Promise<RawForecast> {
    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.raw;
    }
    const raw = await this.client.forecast(latitude, longitude);
    this.cache.set(key, { at: Date.now(), raw });
    return raw;
  }
}
