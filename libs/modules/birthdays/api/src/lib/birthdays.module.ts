import { Module } from '@nestjs/common';
import { BirthdaysAiTools } from './birthdays.ai-tools';
import { BirthdaysAchievements } from './birthdays.achievements';
import { BirthdayRemindersJob } from './birthday-reminders.job';
import { BirthdaysController } from './birthdays.controller';
import { BirthdaysService } from './birthdays.service';

/** Birthdays: CRUD + daily reminders. API: `/api/birthdays`. */
@Module({
  controllers: [BirthdaysController],
  providers: [BirthdaysService, BirthdayRemindersJob, BirthdaysAchievements, BirthdaysAiTools],
})
export class BirthdaysModule {}
