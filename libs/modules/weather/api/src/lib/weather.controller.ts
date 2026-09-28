import { Body, Controller, Delete, Get, HttpCode, Put, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  WeatherLocationInput,
  weatherLocationSchema,
  WeatherSearchQuery,
  weatherSearchQuerySchema,
} from '@pd/contracts';
import { WeatherService } from './weather.service';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  /** Today's forecast, `null` until a location is chosen. */
  @Get()
  forecast(@CurrentUser() user: AuthUser) {
    return this.weather.forecast(user.id);
  }

  @Get('location')
  location(@CurrentUser() user: AuthUser) {
    return this.weather.location(user.id);
  }

  @Put('location')
  setLocation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(weatherLocationSchema)) input: WeatherLocationInput,
  ) {
    return this.weather.setLocation(user.id, input);
  }

  @Delete('location')
  @HttpCode(204)
  clearLocation(@CurrentUser() user: AuthUser) {
    return this.weather.clearLocation(user.id);
  }

  @Get('places')
  search(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(weatherSearchQuerySchema)) { q }: WeatherSearchQuery,
  ) {
    return this.weather.search(user.id, q);
  }
}
