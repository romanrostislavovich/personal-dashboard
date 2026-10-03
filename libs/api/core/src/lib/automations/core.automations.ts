import { Injectable, OnModuleInit } from '@nestjs/common';
import { coreMessages } from '../i18n/core.messages';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { UsersService } from '../users/users.service';
import { AutomationsService } from './automations.service';

const WEEKDAYS = ['any', '1', '2', '3', '4', '5', '6', '7'];

/**
 * The core's own part of the rules: "every day (or Monday) at 09:00" and "send me a message";
 * and the clock that checks the triggers of time every 5 minutes.
 */
@Injectable()
export class CoreAutomations implements OnModuleInit {
  constructor(
    private readonly automations: AutomationsService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'core.daily',
      module: 'core',
      labelKey: 'core.automations.daily',
      description: 'Every day (or one weekday, 1 = Monday) at a time of the user',
      params: [
        { name: 'time', type: 'time', labelKey: 'core.automations.time', required: true },
        {
          name: 'weekday',
          type: 'select',
          labelKey: 'core.automations.weekday',
          options: WEEKDAYS.map((value) => ({
            value,
            labelKey: `core.automations.weekdays.${value}`,
          })),
        },
      ],
      variables: ['date'],
      check: async (_userId, params, now) => {
        const weekday = String(((new Date(`${now.date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1);
        const day = params['weekday'] ?? 'any';
        return now.time >= params['time'] && (day === 'any' || day === weekday)
          ? { date: now.date }
          : null;
      },
    });

    this.automations.registerAction({
      id: 'core.notify',
      module: 'core',
      labelKey: 'core.automations.notify',
      description: 'Send the user a message (Telegram and the dashboard) with a text',
      params: [
        {
          name: 'text',
          type: 'text',
          labelKey: 'core.automations.text',
          required: true,
          template: true,
        },
      ],
      run: async (userId, params, vars) => {
        const text = coreMessages((await this.users.findById(userId))?.locale);
        await this.notifications.send(userId, {
          title: text.automationTitle(vars['rule'] ?? ''),
          body: params['text'],
          source: 'automations',
        });
      },
    });

    this.scheduler.register({
      name: 'automations.time',
      cron: '*/5 * * * *',
      handler: () => this.automations.checkTime(),
    });
  }
}
