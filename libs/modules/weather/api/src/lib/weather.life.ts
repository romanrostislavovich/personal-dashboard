import { Injectable, OnModuleInit } from '@nestjs/common';
import { LifeService } from '@pd/api-core';
import { LifeEvent, LocalDate, WeatherForecast } from '@pd/contracts';
import { fetchPastWeather, pastWeatherMetrics } from './past-weather';
import { WeatherService } from './weather.service';

/** A past day's weather does not change: it is asked for once a day at most. */
const KEEP_MS = 24 * 60 * 60 * 1000;
/** The forecast of the week is asked for again after this long. */
const FORECAST_KEEP_MS = 30 * 60 * 1000;

/**
 * The weather of a day in the Life feed: today and the days ahead from the forecast, the past
 * ones from Open-Meteo's archive (a few days behind — the newest past days have none yet). The
 * place is the one set now, as in the links (weather.links.ts).
 */
@Injectable()
export class WeatherLife implements OnModuleInit {
  private readonly kept = new Map<string, { at: number; event: Promise<LifeEvent | null> }>();
  private readonly forecasts = new Map<
    string,
    { at: number; forecast: Promise<WeatherForecast | null> }
  >();

  constructor(
    private readonly life: LifeService,
    private readonly weather: WeatherService,
  ) {}

  onModuleInit(): void {
    this.life.register({
      module: 'weather',
      day: async (userId, day) => {
        const event =
          (await this.fromForecast(userId, day)) ?? (await this.fromArchive(userId, day));
        return event ? [event] : [];
      },
    });
  }

  private async fromForecast(userId: string, day: LocalDate): Promise<LifeEvent | null> {
    const known = this.forecasts.get(userId);
    const fresh = known && Date.now() - known.at < FORECAST_KEEP_MS;
    const pending = fresh ? known.forecast : this.weather.forecast(userId).catch(() => null);
    if (!fresh) {
      this.forecasts.set(userId, { at: Date.now(), forecast: pending });
    }
    const forecast = await pending;
    const found = forecast?.days.find((candidate) => candidate.date === day);
    return found
      ? event('weather.life.range', {
          min: Math.round(found.min),
          max: Math.round(found.max),
          rain: found.precipitation,
        })
      : null;
  }

  private async fromArchive(userId: string, day: LocalDate): Promise<LifeEvent | null> {
    const place = await this.weather.location(userId);
    if (!place) {
      return null;
    }
    const key = `${place.latitude},${place.longitude},${day}`;
    const known = this.kept.get(key);
    if (known && Date.now() - known.at < KEEP_MS) {
      return known.event;
    }
    const found = fetchPastWeather(place, day, day).then((raw) => {
      const metrics = pastWeatherMetrics(raw);
      const value = (key: string) =>
        metrics.find((metric) => metric.key === key)?.days.find((d) => d.day === day)?.value;
      const temperature = value('weather.temperature');
      return temperature === undefined
        ? null
        : event('weather.life.mean', {
            temp: Math.round(temperature),
            rain: value('weather.rain') ?? 0,
          });
    });
    this.kept.set(key, { at: Date.now(), event: found });
    // A failed request is not kept: the next look asks again.
    found.catch(() => this.kept.delete(key));
    return found.catch(() => null);
  }
}

function event(key: string, params: Record<string, number>): LifeEvent {
  return { module: 'weather', icon: 'partly_cloudy_day', key, params, at: null, link: '/weather' };
}
