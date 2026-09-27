import { Module } from '@nestjs/common';
import { DiaryAchievements } from './diary.achievements';
import { DiaryAiTools } from './diary.ai-tools';
import { DiarySummaryService } from './diary-summary.service';
import { DiaryController } from './diary.controller';
import { DiaryJobs } from './diary.jobs';
import { DiaryService } from './diary.service';

/**
 * Личный дневник: запись на день (markdown), настроение, теги из хэштегов,
 * запись через Telegram (`/d`), вечерние напоминания. API: `/api/diary/*`.
 */
@Module({
  controllers: [DiaryController],
  providers: [DiaryService, DiarySummaryService, DiaryJobs, DiaryAchievements, DiaryAiTools],
})
export class DiaryModule {}
