import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Achievement, AchievementsRecount, achievementsRecountSchema } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ServerActions } from '../sync/server-actions';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';
import { AchievementsService, RECOUNT_ACTION } from './achievements.service';

@Controller('achievements')
export class AchievementsController {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly actions: ServerActions,
  ) {}

  /** List with progress. Also checks whether anything new has unlocked. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Achievement[]> {
    return this.achievements.list(user.id);
  }

  /** Counts a section again: achievements whose condition is not met today are taken back. */
  @Post('recount')
  @HttpCode(204)
  async recount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(achievementsRecountSchema)) input: AchievementsRecount,
  ): Promise<void> {
    await this.actions.run(user.id, RECOUNT_ACTION, input);
  }
}
