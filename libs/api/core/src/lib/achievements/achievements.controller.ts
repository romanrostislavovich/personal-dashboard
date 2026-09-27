import { Controller, Get } from '@nestjs/common';
import { Achievement } from '@pd/contracts';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { AchievementsService } from './achievements.service';

@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  /** Список с прогрессом. Заодно проверяет, не открылось ли что-то новое. */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<Achievement[]> {
    return this.achievements.list(user.id);
  }
}
