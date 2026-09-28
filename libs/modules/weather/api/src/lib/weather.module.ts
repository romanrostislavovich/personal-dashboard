import { Module } from '@nestjs/common';
import { WeatherAiTools } from './weather.ai-tools';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

/** Weather: today's forecast for the user's location and what to wear. API: `/api/weather`. */
@Module({
  controllers: [WeatherController],
  providers: [WeatherService, WeatherAiTools],
})
export class WeatherModule {}
