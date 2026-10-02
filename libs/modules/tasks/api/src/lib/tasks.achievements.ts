import { Injectable, OnModuleInit } from '@nestjs/common';
import { AchievementsService, achievementTiers } from '@pd/api-core';
import { RemindersService } from './reminders.service';
import { TasksService } from './tasks.service';

/** Achievements of the tasks section: tasks done (in total, in a day, in a row, on time) and reminders dealt with. */
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
      id: 'tasks.completed-in-day',
      module: 'tasks',
      measure: async (userId) => (await this.tasks.completionRecords(userId)).bestDay,
      tiers: achievementTiers(
        [
          5,
          '🖐️',
          { en: 'High five', ru: 'Дай пять' },
          { en: '5 tasks done in one day', ru: '5 задач за один день' },
        ],
        [
          10,
          '⚡',
          { en: 'Productive day', ru: 'Ударный день' },
          { en: '10 tasks done in one day', ru: '10 задач за один день' },
        ],
        [
          20,
          '🌪️',
          { en: 'Whirlwind', ru: 'Ураган' },
          { en: '20 tasks done in one day', ru: '20 задач за один день' },
        ],
      ),
    });
    this.achievements.register({
      id: 'tasks.streak',
      module: 'tasks',
      measure: async (userId) => (await this.tasks.completionRecords(userId)).longestStreak,
      tiers: achievementTiers(
        [
          7,
          '🔥',
          { en: 'A week of deeds', ru: 'Неделя дел' },
          { en: 'A task done 7 days in a row', ru: '7 дней подряд с выполненной задачей' },
        ],
        [
          30,
          '📆',
          { en: 'A month of deeds', ru: 'Месяц дел' },
          { en: 'A task done 30 days in a row', ru: '30 дней подряд с выполненной задачей' },
        ],
        [
          100,
          '🗿',
          { en: 'Unstoppable', ru: 'Не остановить' },
          { en: 'A task done 100 days in a row', ru: '100 дней подряд с выполненной задачей' },
        ],
      ),
    });
    this.achievements.register({
      id: 'tasks.on-time',
      module: 'tasks',
      measure: async (userId) => (await this.tasks.completionRecords(userId)).onTime,
      tiers: achievementTiers(
        [
          10,
          '🎯',
          { en: 'On time', ru: 'В срок' },
          { en: '10 tasks done by their due date', ru: '10 задач выполнено в срок' },
        ],
        [
          100,
          '⏱️',
          { en: 'Punctual', ru: 'Пунктуальность' },
          { en: '100 tasks done by their due date', ru: '100 задач выполнено в срок' },
        ],
        [
          500,
          '🚄',
          { en: 'On schedule', ru: 'Строго по расписанию' },
          { en: '500 tasks done by their due date', ru: '500 задач выполнено в срок' },
        ],
      ),
    });
    this.achievements.register({
      id: 'tasks.urgent',
      module: 'tasks',
      measure: async (userId) => (await this.tasks.completionRecords(userId)).urgent,
      tiers: achievementTiers(
        [
          10,
          '🚨',
          { en: 'First things first', ru: 'Сначала главное' },
          {
            en: '10 tasks of the highest priority done',
            ru: '10 задач высшего приоритета выполнено',
          },
        ],
        [
          100,
          '🧯',
          { en: 'Firefighter', ru: 'Пожарный' },
          {
            en: '100 tasks of the highest priority done',
            ru: '100 задач высшего приоритета выполнено',
          },
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
