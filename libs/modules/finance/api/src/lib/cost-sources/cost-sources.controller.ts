import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import { CostSourceInput, costSourceInputSchema } from '@pd/contracts';
import { FINANCE_ACTIONS } from '../finance.server-actions';
import { CostSourcesService } from './cost-sources.service';

/** Automatic cost import from external services: `/api/finance/cost-sources`. */
@Controller('finance/cost-sources')
export class CostSourcesController {
  constructor(
    private readonly costSources: CostSourcesService,
    private readonly actions: ServerActions,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.costSources.list(user.id);
  }

  @Post()
  @HttpCode(204)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(costSourceInputSchema)) input: CostSourceInput,
  ) {
    return this.actions.run(user.id, FINANCE_ACTIONS.addCostSource, input);
  }

  @Post(':id/sync')
  @HttpCode(204)
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.run(user.id, FINANCE_ACTIONS.syncCostSource, { id });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.costSources.remove(user.id, id);
  }
}
