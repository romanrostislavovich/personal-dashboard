import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, NO_PARAMETERS } from '@pd/api-core';
import { WeatherService } from './weather.service';

/** AI access to the weather: today's forecast and what to wear (the morning digest uses it). */
@Injectable()
export class WeatherAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly weather: WeatherService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'weather_today',
      module: 'weather',
      description:
        "Today's weather where the user is: now, min/max and feels-like temperature (°C), " +
        'chance (%) and amount (mm) of precipitation, wind (km/h), UV index, sunrise/sunset, ' +
        'hourly forecast and clothing advice — `outfit` (heavy-winter … hot, by the coldest ' +
        'feels-like temperature of the day) and `extras` to take (umbrella, gloves, sunscreen…). ' +
        'Use it for the morning digest and for "what should I wear". ' +
        'null — no location set: the user chooses it on the Weather page.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.weather.forecast(userId),
    });
  }
}
