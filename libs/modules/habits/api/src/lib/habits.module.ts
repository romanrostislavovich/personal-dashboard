import { Module } from '@nestjs/common';
import { HabitsAchievements } from './habits.achievements';
import { HabitsAiTools } from './habits.ai-tools';
import { HabitsController } from './habits.controller';
import { HabitsDigest } from './habits.digest';
import { HabitsJobs } from './habits.jobs';
import { HabitsLinks } from './habits.links';
import { HabitsService } from './habits.service';

/**
 * Habits to quit or cut down — alcohol, smoking, one's own: the run of clean days from the
 * start, the days with it marked on the page, by the evening question in Telegram or by the
 * assistant. API: `/api/habits`.
 */
@Module({
  controllers: [HabitsController],
  providers: [
    HabitsService,
    HabitsJobs,
    HabitsAchievements,
    HabitsAiTools,
    HabitsDigest,
    HabitsLinks,
  ],
})
export class HabitsModule {}
