import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService } from '@pd/api-core';
import { DailyMetric } from '@pd/contracts';
import { fetchPastWeather, pastWeatherMetrics } from './past-weather';
import { WeatherService } from './weather.service';

/** The archive does not change: the same period is not asked for again for this long. */
const KEEP_MS = 6 * 60 * 60 * 1000;

/**
 * What the weather tells the other sections (see LinksService): the temperature, the rain and
 * the sun of every past day — what goes with a good or a bad day. The days are those of the
 * place set now: a trip of the past is told with the weather of home.
 */
@Injectable()
export class WeatherLinks implements OnModuleInit {
  private readonly kept = new Map<string, { at: number; metrics: Promise<DailyMetric[]> }>();

  constructor(
    private readonly links: LinksService,
    private readonly weather: WeatherService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'weather',
      metrics: async (userId, { from, to }) => {
        const place = await this.weather.location(userId);
        if (!place) {
          return [];
        }
        const key = `${place.latitude},${place.longitude},${from},${to}`;
        const known = this.kept.get(key);
        if (known && Date.now() - known.at < KEEP_MS) {
          return known.metrics;
        }
        const metrics = fetchPastWeather(place, from, to).then(pastWeatherMetrics);
        this.kept.set(key, { at: Date.now(), metrics });
        // A failed request is not kept: the next question asks again.
        metrics.catch(() => this.kept.delete(key));
        return metrics;
      },
    });

    this.links.registerPages([
      { module: 'weather', path: '/weather', description: 'the forecast and what to wear' },
    ]);
  }
}
