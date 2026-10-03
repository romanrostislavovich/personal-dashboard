import { Controller, Get, Query } from '@nestjs/common';
import {
  LifeDay,
  LifeDayQuery,
  lifeDayQuerySchema,
  LifeSummary,
  LifeSummaryQuery,
  lifeSummaryQuerySchema,
} from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { LifeService } from './life.service';

/** The life timeline and the summaries: `/api/life/day`, `/api/life/summary`. */
@Controller('life')
export class LifeController {
  constructor(private readonly life: LifeService) {}

  @Get('day')
  day(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeDayQuerySchema)) query: LifeDayQuery,
  ): Promise<LifeDay> {
    return this.life.day(user.id, query.day);
  }

  @Get('summary')
  async summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(lifeSummaryQuerySchema)) query: LifeSummaryQuery,
  ): Promise<LifeSummary> {
    return { ...query, cards: await this.life.period(user.id, query) };
  }
}
