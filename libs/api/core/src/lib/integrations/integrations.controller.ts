import { Controller, Get } from '@nestjs/common';
import { IntegrationStatus } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { IntegrationsService } from './integrations.service';

/** The state of every connection to an outside service: `/api/integrations`. */
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  statuses(@CurrentUser() user: AuthUser): Promise<IntegrationStatus[]> {
    return this.integrations.statuses(user.id);
  }
}
