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
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import { CostSourceInput, costSourceInputSchema } from '@pd/contracts';
import { CostSourcesService } from './cost-sources.service';

/** Автоимпорт затрат из внешних сервисов: `/api/finance/cost-sources`. */
@Controller('finance/cost-sources')
export class CostSourcesController {
  constructor(private readonly costSources: CostSourcesService) {}

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
    return this.costSources.create(user.id, input);
  }

  @Post(':id/sync')
  @HttpCode(204)
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.costSources.syncOne(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.costSources.remove(user.id, id);
  }
}
