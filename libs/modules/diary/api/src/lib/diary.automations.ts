import { Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService } from '@pd/api-core';
import { DiaryService } from './diary.service';

/** The diary in the rules "if X, then Y": no entry by a time; a line added to today's entry. */
@Injectable()
export class DiaryAutomations implements OnModuleInit {
  constructor(
    private readonly automations: AutomationsService,
    private readonly diary: DiaryService,
  ) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'diary.noEntryBy',
      module: 'diary',
      labelKey: 'diary.automations.noEntryBy',
      description: 'There is no diary entry today by a time of the user',
      params: [{ name: 'time', type: 'time', labelKey: 'diary.automations.time', required: true }],
      variables: [],
      check: async (userId, params, now) => {
        if (now.time < params['time']) {
          return null;
        }
        const entry = await this.diary.get(userId, now.date);
        return entry?.content.trim() ? null : {};
      },
    });

    this.automations.registerAction({
      id: 'diary.append',
      module: 'diary',
      labelKey: 'diary.automations.append',
      description: "Add a line to today's diary entry",
      params: [
        {
          name: 'text',
          type: 'text',
          labelKey: 'diary.automations.text',
          required: true,
          template: true,
        },
      ],
      run: (userId, params) => this.diary.appendToToday(userId, params['text']),
    });
  }
}
