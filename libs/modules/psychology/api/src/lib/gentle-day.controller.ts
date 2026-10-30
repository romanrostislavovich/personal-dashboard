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
  Query,
} from '@nestjs/common';
import {AuthUser, CurrentUser, ZodValidationPipe} from '@pd/api-core';
import {
  gentleDayInputSchema,
  gentleDayQuerySchema,
  GentleStepInput,
  gentleStepInputSchema,
  LocalDate,
} from '@pd/contracts';
import {z} from 'zod';
import {GentleDayService} from './gentle-day.service';

/** A gentle day: the library of small steps and the plan of a day. */
@Controller('psychology/gentle')
export class GentleDayController {
  constructor(private readonly gentle: GentleDayService) {}

  @Get('steps')
  steps(@CurrentUser() user: AuthUser) {
    return this.gentle.steps(user.id);
  }

  @Post('steps')
  addStep(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(gentleStepInputSchema)) input: GentleStepInput,
  ) {
    return this.gentle.addStep(user.id, input);
  }

  @Put('steps/:id')
  updateStep(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(gentleStepInputSchema)) input: GentleStepInput,
  ) {
    return this.gentle.updateStep(user.id, id, input);
  }

  @Delete('steps/:id')
  @HttpCode(204)
  removeStep(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gentle.removeStep(user.id, id);
  }

  /** `?date=` — the user's own day. */
  @Get('day')
  day(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(gentleDayQuerySchema))
    query: {date: LocalDate},
  ) {
    return this.gentle.day(user.id, query.date);
  }

  @Put('day')
  saveDay(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(gentleDayInputSchema))
    input: z.output<typeof gentleDayInputSchema>,
  ) {
    return this.gentle.saveDay(user.id, input);
  }

  @Delete('day/:date')
  @HttpCode(204)
  leaveDay(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(gentleDayQuerySchema))
    params: {date: LocalDate},
  ) {
    return this.gentle.leaveDay(user.id, params.date);
  }
}
