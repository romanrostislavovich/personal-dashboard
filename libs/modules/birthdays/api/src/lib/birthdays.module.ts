import { Module } from '@nestjs/common';
import { BirthdaysAchievements } from './birthdays.achievements';
import { BirthdayRemindersJob } from './birthday-reminders.job';
import { BirthdaysController } from './birthdays.controller';
import { BirthdaysService } from './birthdays.service';

/** Дни рождения: CRUD + ежедневные напоминания. API: `/api/birthdays`. */
@Module({
  controllers: [BirthdaysController],
  providers: [BirthdaysService, BirthdayRemindersJob, BirthdaysAchievements],
})
export class BirthdaysModule {}
