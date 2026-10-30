import {Module} from '@nestjs/common';
import {WeatherAiTools} from './weather.ai-tools';
import {WeatherDemo} from './weather.demo';
import {WeatherDigest} from './weather.digest';
import {WeatherLife} from './weather.life';
import {WeatherLinks} from './weather.links';
import {WeatherController} from './weather.controller';
import {WeatherService} from './weather.service';

/** Weather: today's forecast for the user's location and what to wear. API: `/api/weather`. */
@Module({
  controllers: [WeatherController],
  providers: [
    WeatherService,
    WeatherAiTools,
    WeatherDigest,
    WeatherLinks,
    WeatherLife,
    WeatherDemo,
  ],
})
export class WeatherModule {}
