import { Inject, Injectable } from '@nestjs/common';
import { DB, Database, UsersService } from '@pd/api-core';
import { WeatherForecast, WeatherLocation, WeatherLocationInput } from '@pd/contracts';
import { eq } from 'drizzle-orm';
import { toForecast } from './forecast';
import { OpenMeteoClient, RawForecast } from './open-meteo.client';
import { weatherLocations } from './weather.schema';

/** Forecasts update hourly; a page, a widget and the digest opened together share one request. */
const CACHE_MS = 15 * 60 * 1000;

/**
 * The user's location and today's forecast for it. Only reads from Open-Meteo and writes nothing,
 * so a sync client calls it directly instead of going through the server.
 */
@Injectable()
export class WeatherService {
  private readonly client = new OpenMeteoClient();
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

  /** Today's forecast for the user's location; `null` until they choose one. */
  async forecast(userId: string): Promise<WeatherForecast | null> {
    const location = await this.location(userId);
    return location ? toForecast(await this.rawForecast(location), location) : null;
  }

  /** Places by name, in the user's language. */
  async search(userId: string, query: string): Promise<WeatherLocation[]> {
    const locale = (await this.users.findById(userId))?.locale ?? 'en';
    return this.client.search(query, locale);
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
