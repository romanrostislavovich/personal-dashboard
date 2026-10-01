import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers } from '@pd/api-core';
import { RemindersService } from './reminders.service';
import { TasksService } from './tasks.service';

/** Achievements of the tasks section: tasks done and reminders dealt with. */
@Injectable()
export class TasksAchievements implements OnModuleInit {
  constructor(
    private readonly achievements: AchievementsService,
    private readonly tasks: TasksService,
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    this.achievements.register({
      id: 'tasks.completed',
      module: 'tasks',
      measure: (userId) => this.tasks.completedCount(userId),
      tiers: achievementTiers(
        [
          1,
          '✅',
          { en: 'The first tick', ru: 'Первая галочка' },
          { en: 'The first task done', ru: 'Первая выполненная задача' },
        ],
        [
          25,
          '📋',
          { en: 'Getting things done', ru: 'Дела делаются' },
          { en: '25 tasks done', ru: '25 выполненных задач' },
        ],
        [
          100,
          '🧹',
          { en: 'A hundred off the list', ru: 'Сотня с плеч' },
          { en: '100 tasks done', ru: '100 выполненных задач' },
        ],
        [
          500,
          '🏗️',
          { en: 'Machine of deeds', ru: 'Машина дел' },
          { en: '500 tasks done', ru: '500 выполненных задач' },
        ],
        [
          1000,
          '🏆',
          { en: 'A thousand done', ru: 'Тысяча дел' },
          { en: '1,000 tasks done', ru: '1 000 выполненных задач' },
        ],
      ),
    });
    this.achievements.register({
      id: 'tasks.reminders-done',
      module: 'tasks',
      measure: (userId) => this.reminders.doneCount(userId),
      tiers: achievementTiers(
        [
          10,
          '⏰',
          { en: 'Never forgets', ru: 'Ничего не забыл' },
          { en: '10 reminders dealt with', ru: '10 напоминаний, по которым всё сделано' },
        ],
        [
          100,
          '🔔',
          { en: 'On the bell', ru: 'По звонку' },
          { en: '100 reminders dealt with', ru: '100 напоминаний, по которым всё сделано' },
        ],
        [
          500,
          '🕰️',
          { en: 'Like clockwork', ru: 'Как часы' },
          { en: '500 reminders dealt with', ru: '500 напоминаний, по которым всё сделано' },
        ],
      ),
    });
  }
}
