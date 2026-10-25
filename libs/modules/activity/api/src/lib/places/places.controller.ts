import {
  BadRequestException,
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
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  FoundPlaceName,
  GoogleKeysInput,
  googleKeysInputSchema,
  NamedPlace,
  PlaceLookup,
  placeLookupSchema,
  PlacesSettings,
  placesImportSchema,
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
import { z } from 'zod';
import { PlaceNamesService } from './place-names.service';
import { PlacesAutomations } from './places.automations';
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
    private readonly names: PlaceNamesService,
    private readonly automations: PlacesAutomations,
  ) {}

  @Public()
  @Post('device/locations')
  async ingest(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodValidationPipe(phoneLocationIngestSchema)) body: PhoneLocationIngest,
  ): Promise<{ saved: number }> {
    const device = await this.devices.authenticate(authorization);
    const saved = await this.places.ingest(device, body.locations);
    // Came to a place, left it: in the background, the phone need not wait for the rules.
    void this.automations.check(device.userId);
    return { saved };
  }

  @Get('places')
  overview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(placesQuerySchema)) query: PlacesQuery,
  ): Promise<PlacesOverview> {
    return this.places.overview(user.id, query.day);
  }

  @Get('places/settings')
  async settings(@CurrentUser() user: AuthUser): Promise<PlacesSettings> {
    const keys = await this.names.googleKeys(user.id);
    return { googlePlaces: keys.places, googleMapsKey: keys.mapsKey };
  }

  @Put('places/google')
  @HttpCode(204)
  saveGoogle(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(googleKeysInputSchema)) body: GoogleKeysInput,
  ): Promise<void> {
    return this.names.saveGoogleKeys(user.id, body);
  }

  @Delete('places/google/:which')
  @HttpCode(204)
  removeGoogle(@CurrentUser() user: AuthUser, @Param('which') which: string): Promise<void> {
    if (which !== 'places' && which !== 'maps') {
      throw new BadRequestException('places or maps');
    }
    return this.names.removeGoogleKey(user.id, which);
  }

  /** "Look up on Google" for one stay; `null` — Google knows nothing there. */
  @Post('places/lookup-google')
  lookUpOnGoogle(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(placeLookupSchema)) body: PlaceLookup,
  ): Promise<FoundPlaceName | null> {
    return this.names.lookUpOnGoogle(user.id, body);
  }

  /** A batch of a Google Maps timeline the browser read from a Takeout file. */
  @Post('places/import')
  async import(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(placesImportSchema)) body: z.output<typeof placesImportSchema>,
  ): Promise<{ saved: number }> {
    const saved = await this.places.importTimeline(user.id, body.locations);
    await this.names.importNames(user.id, body.names);
    return { saved };
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
