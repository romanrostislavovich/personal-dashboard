import {Injectable, OnModuleInit} from '@nestjs/common';
import {SchedulerService, TelegramBotService} from '@pd/api-core';
import {INTAKE_ACTION, IntakesService} from './intakes.service';

/** The reminders to take medications go out every minute; the buttons under them answer. */
@Injectable()
export class IntakesJobs implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly telegram: TelegramBotService,
    private readonly intakes: IntakesService,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: 'health.medication-reminders',
      cron: '* * * * *',
      // Every minute: a line in the log for each run would drown everything else.
      quiet: true,
      handler: () => this.intakes.fireDue(),
    });
    this.telegram.registerAction({
      name: INTAKE_ACTION,
      handler: (user, payload) => this.intakes.answerButton(user, payload),
    });
  }
}
