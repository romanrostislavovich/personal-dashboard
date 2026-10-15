import {
  BadRequestException,
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
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  Habit,
  HabitDayInput,
  habitDayInputSchema,
  HabitInput,
  habitInputSchema,
  ValidHabitInput,
} from '@pd/contracts';
import { HabitsService } from './habits.service';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Habits to quit or cut down. API: `/api/habits`. */
@Controller('habits')
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Habit[]> {
    return this.habits.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(habitInputSchema)) input: HabitInput,
  ): Promise<Habit> {
    return this.habits.create(user.id, input as ValidHabitInput);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(habitInputSchema)) input: HabitInput,
  ): Promise<Habit> {
    return this.habits.update(user.id, id, input as ValidHabitInput);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.habits.remove(user.id, id);
  }

  /** A day with it (or clean). */
  @Put(':id/days/:day')
  mark(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('day') day: string,
    @Body(new ZodValidationPipe(habitDayInputSchema)) input: HabitDayInput,
  ): Promise<Habit> {
    return this.habits.mark(user.id, id, checkedDay(day), input);
  }

  /** The mark taken off: the day counts as clean again. */
  @Delete(':id/days/:day')
  unmark(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('day') day: string,
  ): Promise<Habit> {
    return this.habits.unmark(user.id, id, checkedDay(day));
  }
}

function checkedDay(day: string): string {
  if (!DAY.test(day) || Number.isNaN(Date.parse(day))) {
    throw new BadRequestException('Expected a day like 2026-10-15');
  }
  return day;
}
