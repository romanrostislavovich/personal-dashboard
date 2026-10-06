import { Module } from '@nestjs/common';
import { DiaryAutomations } from './diary.automations';
import { DiaryLife } from './diary.life';
import { DiaryExport } from './diary.export';
import { DiarySearch } from './diary.search';
import { DiaryAchievements } from './diary.achievements';
import { DiaryAiTools } from './diary.ai-tools';
import { DiaryDigest } from './diary.digest';
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
    DiaryAutomations,
    DiaryLife,
    DiaryExport,
    DiarySearch,
    DiaryService,
    DiaryPhotosService,
    DiarySummaryService,
    DiaryJobs,
    DiaryAchievements,
    DiaryAiTools,
    DiaryDigest,
  ],
})
export class DiaryModule {}
