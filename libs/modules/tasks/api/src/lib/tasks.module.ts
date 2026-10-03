import { Module } from '@nestjs/common';
import { TasksLife } from './tasks.life';
import { TasksSearch } from './tasks.search';
import { RemindersService } from './reminders.service';
import { TasksAchievements } from './tasks.achievements';
import { TasksAiTools } from './tasks.ai-tools';
import { TasksController } from './tasks.controller';
import { TasksDigest } from './tasks.digest';
import { TasksJobs } from './tasks.jobs';
import { TasksService } from './tasks.service';

/**
 * Tasks: the TODO list (lists, tags, repeating tasks) and reminders sent at a time, with
 * `/todo`, `/remind` and `/tasks` in Telegram. API: `/api/tasks`.
 */
@Module({
  controllers: [TasksController],
  providers: [
    TasksLife,
    TasksSearch,
    TasksService,
    RemindersService,
    TasksJobs,
    TasksAchievements,
    TasksAiTools,
    TasksDigest,
  ],
})
export class TasksModule {}
