import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, DemoService } from '@pd/api-core';
import { weatherLocations } from './weather.schema';

/** The demo data of Weather: a city. The forecast itself is real (Open-Meteo needs no key). */
@Injectable()
export class WeatherDemo implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly demo: DemoService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'weather',
      seed: async ({ userId }) => {
        await this.db.insert(weatherLocations).values({
          userId,
          name: 'Lisbon',
          country: 'Portugal',
          latitude: 38.72,
          longitude: -9.14,
        });
      },
    });
  }
}
