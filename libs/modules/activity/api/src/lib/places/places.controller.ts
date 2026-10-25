import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  NamedPlace,
  PhoneLocationIngest,
  phoneLocationIngestSchema,
  PlaceInput,
  placeInputSchema,
  PlacesOverview,
  PlacesQuery,
  placesQuerySchema,
  PlaceUpdate,
  placeUpdateSchema,
} from '@pd/contracts';
import { DevicesService } from '../devices.service';
import { PlacesService } from './places.service';

/**
 * The phone's location: the Android app sends its fixes with its device token, like its
 * notifications; Activity → Places reads the day and names the places.
 */
@Controller('activity')
export class PlacesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly places: PlacesService,
  ) {}

  @Public()
  @Post('device/locations')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneLocationIngestSchema)) body: PhoneLocationIngest,
  ): Promise<{ saved: number }> {
    const device = await this.devices.authenticate(authorization);
    return { saved: await this.places.ingest(device, body.locations) };
  }

  @Get('places')
  overview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(placesQuerySchema)) query: PlacesQuery,
  ): Promise<PlacesOverview> {
    return this.places.overview(user.id, query.day);
  }

  @Post('places')
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(placeInputSchema)) body: PlaceInput,
  ): Promise<NamedPlace> {
    return this.places.addPlace(user.id, body);
  }

  @Patch('places/:id')
  @HttpCode(204)
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(placeUpdateSchema)) body: PlaceUpdate,
  ): Promise<void> {
    return this.places.renamePlace(user.id, id, body.name);
  }

  @Delete('places/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.places.removePlace(user.id, id);
  }
}
