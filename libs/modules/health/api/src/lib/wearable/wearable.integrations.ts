import {Injectable, OnModuleInit} from '@nestjs/common';
import {IntegrationsService} from '@pd/api-core';
import {WearableService} from './wearable.service';

/** Synced every hour; a day without a sync means the consent or the band is gone. */
const STALE_HOURS = 24;

/** Google Health (the band) in the list of integrations. */
@Injectable()
export class WearableIntegrations implements OnModuleInit {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly wearable: WearableService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'health.google-health',
      name: 'Google Health',
      module: 'health',
      staleHours: STALE_HOURS,
      reports: async userId => {
        const status = await this.wearable.status(userId);
        return status.connected
          ? [
              {
                name: 'Google Health',
                lastSyncedAt: status.lastSyncedAt
                  ? new Date(status.lastSyncedAt)
                  : null,
                error: status.error,
              },
            ]
          : [];
      },
    });
  }
}
