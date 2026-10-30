import {Injectable, OnModuleInit} from '@nestjs/common';
import {IntegrationsService} from '@pd/api-core';
import {PlaceNamesService} from './place-names.service';

/** Google for the places, in the list of integrations: both keys are the user's choice. */
@Injectable()
export class PlacesIntegrations implements OnModuleInit {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly names: PlaceNamesService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'activity.google-places',
      module: 'activity',
      name: 'Google Places',
      reports: async userId =>
        (await this.names.googleKeys(userId)).places
          ? [{name: 'Google Places'}]
          : [],
    });
    this.integrations.register({
      id: 'activity.google-maps',
      module: 'activity',
      name: 'Google Maps',
      reports: async userId =>
        (await this.names.googleKeys(userId)).mapsKey
          ? [{name: 'Google Maps'}]
          : [],
    });
  }
}
