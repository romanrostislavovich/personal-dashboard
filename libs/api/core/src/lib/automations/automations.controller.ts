import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  AutomationDraftRequest,
  automationDraftRequestSchema,
  automationRuleInputSchema,
} from '@pd/contracts';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AutomationsService } from './automations.service';

type ValidRuleInput = z.output<typeof automationRuleInputSchema>;

/** Rules "if X, then Y": `/api/automations`. */
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  /** The triggers and actions the modules registered. */
  @Get('catalog')
  catalog() {
    return this.automations.catalog();
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.automations.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(automationRuleInputSchema)) input: ValidRuleInput,
  ) {
    return this.automations.create(user.id, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(automationRuleInputSchema)) input: ValidRuleInput,
  ) {
    return this.automations.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.automations.remove(user.id, id);
  }

  /** A sentence → a rule filled in by the AI, to check and save. */
  @Post('draft')
  draft(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(automationDraftRequestSchema)) body: AutomationDraftRequest,
  ) {
    return this.automations.draft(user.id, body.text);
  }
}
