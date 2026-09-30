import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { WeatherService } from './weather.service';

/** The weather opens every morning digest, changed or not. */
@Injectable()
export class WeatherDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly weather: WeatherService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'weather.today',
      module: 'weather',
      always: true,
      description:
        "Today's weather (°C, km/h, mm, %) and clothing advice: `outfit` by the coldest " +
        'feels-like temperature of the day and `extras` to take (umbrella, gloves, sunscreen…).',
      collect: (userId) => this.weather.forecast(userId),
    });
  }
}
