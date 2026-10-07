import { Injectable, OnModuleInit } from '@nestjs/common';
import { AutomationsService, LinksService } from '@pd/api-core';
import { BirthdaysService } from './birthdays.service';

/** The trigger does not fire before this time of the user: a task at midnight helps nobody. */
const NOT_BEFORE = '08:00';
const DEFAULT_DAYS = 7;

/**
 * Birthdays in the rules "if X, then Y": a birthday is some days away — "make a task to buy a
 * gift a week before". The action is another section's (a task, a reminder): the core joins them.
 */
@Injectable()
export class BirthdaysAutomations implements OnModuleInit {
  constructor(
    private readonly automations: AutomationsService,
    private readonly birthdays: BirthdaysService,
    private readonly links: LinksService,
  ) {}

  onModuleInit(): void {
    this.automations.registerTrigger({
      id: 'birthdays.upcoming',
      module: 'birthdays',
      labelKey: 'birthdays.automations.upcoming',
      description:
        'A birthday of somebody alive is exactly `days` days away (7 by default); for several ' +
        'people on the same day the names come together',
      params: [{ name: 'days', type: 'number', labelKey: 'birthdays.automations.days' }],
      variables: ['name', 'date', 'days', 'age'],
      check: async (userId, params, now) => {
        if (now.time < NOT_BEFORE) {
          return null;
        }
        const days = Math.max(0, Math.round(Number(params['days'] ?? DEFAULT_DAYS)) || 0);
        const people = (await this.birthdays.list(userId)).filter(
          // A birthday of somebody who died needs no gift.
          (person) => person.daysUntil === days && person.deathMonth === null,
        );
        if (!people.length) {
          return null;
        }
        return {
          name: people.map((person) => person.name).join(', '),
          date: people[0].nextDate ?? '',
          days: String(days),
          age: people.length === 1 ? String(people[0].turningAge ?? '') : '',
        };
      },
    });

    this.links.registerPages([
      { module: 'birthdays', path: '/birthdays', description: 'birthdays and days of memory' },
    ]);
  }
}
