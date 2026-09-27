import { Module } from '@nestjs/common';
import { DiaryAchievements } from './diary.achievements';
import { DiaryAiTools } from './diary.ai-tools';
import { DiaryPhotosService } from './diary-photos.service';
import { DiarySummaryService } from './diary-summary.service';
import { DiaryController } from './diary.controller';
import { DiaryJobs } from './diary.jobs';
import { DiaryService } from './diary.service';

/**
 * Personal diary: one entry per day (markdown), mood, tags from hashtags, emoji marks,
 * photos, search, year heatmap, insights, Telegram (`/d`, `/mood`, `/today`, photos),
 * evening reminders. API: `/api/diary/*`.
 */
@Module({
  controllers: [DiaryController],
  providers: [
    DiaryService,
    DiaryPhotosService,
    DiarySummaryService,
    DiaryJobs,
    DiaryAchievements,
    DiaryAiTools,
  ],
})
export class DiaryModule {}
