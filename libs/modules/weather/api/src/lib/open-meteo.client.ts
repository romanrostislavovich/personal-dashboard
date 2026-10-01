import { WeatherLocation } from '@pd/contracts';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 10_000;

const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'uv_index',
] as const;

const DAILY = [
  'weather_code',
  'temperature_2m_min',
  'temperature_2m_max',
  'apparent_temperature_min',
  'apparent_temperature_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'uv_index_max',
  'sunrise',
  'sunset',
] as const;

/** Values can be `null` for hours a model does not cover. */
type Series<Keys extends readonly string[]> = { time: string[] } & {
  [Key in Keys[number]]: (number | null)[];
};

/** Days of the forecast, starting with today. */
const FORECAST_DAYS = 7;

/** Open-Meteo forecast for a week; times are local to the place (`timezone=auto`). */
export interface RawForecast {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  hourly: Series<typeof HOURLY>;
  daily: Omit<Series<typeof DAILY>, 'sunrise' | 'sunset'> & { sunrise: string[]; sunset: string[] };
}

interface RawPlace {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

/**
 * Open-Meteo (open-meteo.com): forecasts and place search without an API key,
 * free for non-commercial use. Units: °C, km/h, mm.
 */
export class OpenMeteoClient {
  async forecast(latitude: number, longitude: number): Promise<RawForecast> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      timezone: 'auto',
      forecast_days: String(FORECAST_DAYS),
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
      hourly: HOURLY.join(','),
      daily: DAILY.join(','),
    });
    return this.get<RawForecast>(`${FORECAST_URL}?${params}`);
  }

  /** Places by name in the given language (`en`, `ru`…), the most populated first. */
  async search(query: string, language: string): Promise<WeatherLocation[]> {
    const params = new URLSearchParams({ name: query, count: '8', language, format: 'json' });
    const { results = [] } = await this.get<{ results?: RawPlace[] }>(`${GEOCODING_URL}?${params}`);
    return results.map((place) => ({
      name: place.name,
      region: place.admin1 ?? null,
      country: place.country ?? null,
      latitude: place.latitude,
      longitude: place.longitude,
    }));
  }

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`Open-Meteo responded ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}
