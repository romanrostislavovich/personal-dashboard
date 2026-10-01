import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Achievement } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ServerActions } from '../sync/server-actions';
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

  /** Counts all achievements again: the ones whose condition is not met today are taken back. */
  @Post('recount')
  @HttpCode(204)
  async recount(@CurrentUser() user: AuthUser): Promise<void> {
    await this.actions.run(user.id, RECOUNT_ACTION);
  }
}
