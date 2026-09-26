import { Module } from '@nestjs/common';
import { DiaryController } from './diary.controller';
import { DiaryJobs } from './diary.jobs';
import { DiaryService } from './diary.service';

/**
 * Личный дневник: запись на день (markdown), настроение, теги из хэштегов,
 * запись через Telegram (`/d`), вечерние напоминания. API: `/api/diary/*`.
 */
@Module({
  controllers: [DiaryController],
  providers: [DiaryService, DiaryJobs],
})
export class DiaryModule {}
