import {Injectable, OnModuleInit} from '@nestjs/common';
import {SchedulerService, TelegramBotService} from '@pd/api-core';
import {HABIT_ACTION, HabitsService} from './habits.service';

/** The evening question goes out every minute it is due; the buttons under it answer. */
@Injectable()
export class HabitsJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly habits: HabitsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'habits.evening-question',
      cron: '* * * * *',
      // Every minute: a line in the log for each run would drown everything else.
      quiet: true,
      handler: () => this.habits.askDue(),
    });
    this.telegram.registerAction({
      name: HABIT_ACTION,
      handler: (user, payload) => this.habits.answerButton(user, payload),
      settled: (user, payload) => this.habits.buttonSettled(user, payload),
    });
  }
}
