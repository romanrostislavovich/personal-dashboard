import { BirthdaysDemo } from './birthdays.demo';
import { Module } from '@nestjs/common';
import { BirthdaysAutomations } from './birthdays.automations';
import { BirthdaysLife } from './birthdays.life';
import { BirthdaysSearch } from './birthdays.search';
import { BirthdaysAiTools } from './birthdays.ai-tools';
import { BirthdaysDigest } from './birthdays.digest';
import { BirthdaysAchievements } from './birthdays.achievements';
import { BirthdayRemindersJob } from './birthday-reminders.job';
import { BirthdaysController } from './birthdays.controller';
import { BirthdaysService } from './birthdays.service';

/** Birthdays: CRUD + daily reminders. API: `/api/birthdays`. */
@Module({
  controllers: [BirthdaysController],
  providers: [
    BirthdaysAutomations,
    BirthdaysDemo,
    BirthdaysLife,
    BirthdaysSearch,
    BirthdaysService,
    BirthdayRemindersJob,
    BirthdaysAchievements,
    BirthdaysAiTools,
    BirthdaysDigest,
  ],
})
export class BirthdaysModule {}
