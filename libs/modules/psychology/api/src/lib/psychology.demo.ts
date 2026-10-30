import {Injectable, OnModuleInit} from '@nestjs/common';
import {DemoService} from '@pd/api-core';
import {PsychologyService} from './psychology.service';

/** The demo data of Psychology: a few events and check-ups. */
@Injectable()
export class PsychologyDemo implements OnModuleInit {
  constructor(
    private readonly demo: DemoService,
    private readonly psychology: PsychologyService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'psychology',
      seed: context => this.seed(context.userId, context.daysAgo),
    });
  }

  private async seed(
    userId: string,
    daysAgo: (days: number) => string,
  ): Promise<void> {
    const events: [
      string,
      string | null,
      number,
      number | null,
      -2 | -1 | 0 | 1 | 2,
    ][] = [
      [
        'Moved to a new flat',
        'Boxes everywhere for a week, then it felt like home.',
        34,
        27,
        1,
      ],
      ['A cold', 'Three days in bed.', 19, 17, -1],
      ["Launch of the shop's new checkout", null, 12, 9, 2],
      ['Mia in town', 'Walks, tea and long talks.', 4, 3, 2],
    ];
    for (const [title, description, from, to, feeling] of events) {
      await this.psychology.addEvent(userId, {
        title,
        description,
        startedOn: daysAgo(from),
        endedOn: to === null ? null : daysAgo(to),
        feeling,
      });
    }
    // Something remembered by age, and the year of birth that places it in time.
    await this.psychology.saveSettings(userId, {birthYear: 1994});
    await this.psychology.addEvent(userId, {
      title: 'Summers at the lake with grandfather',
      description: 'Fishing at dawn. The calm I still look for.',
      ageFrom: 6,
      ageTo: 9,
      feeling: 2,
    });
    const checkups: ['who5' | 'gad7', number, number[]][] = [
      ['who5', 60, [2, 2, 3, 2, 3]],
      ['who5', 30, [3, 3, 3, 2, 3]],
      ['who5', 1, [4, 3, 4, 3, 4]],
      ['gad7', 30, [1, 2, 1, 1, 0, 1, 1]],
      ['gad7', 1, [1, 1, 0, 1, 0, 1, 0]],
    ];
    for (const [test, days, answers] of checkups) {
      await this.psychology.addAssessment(userId, {
        test,
        takenOn: daysAgo(days),
        answers,
      });
    }
  }
}
