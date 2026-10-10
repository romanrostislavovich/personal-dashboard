import { Injectable, OnModuleInit } from '@nestjs/common';
import { DemoService } from '@pd/api-core';
import { PsychologyService } from './psychology.service';
import { ReflectionsService } from './reflections.service';

/** The demo data of Psychology: a few events, notes, check-ups and a week's questions. */
@Injectable()
export class PsychologyDemo implements OnModuleInit {
  constructor(
    private readonly demo: DemoService,
    private readonly psychology: PsychologyService,
    private readonly reflections: ReflectionsService,
  ) {}

  onModuleInit(): void {
    this.demo.register({
      module: 'psychology',
      seed: (context) => this.seed(context.userId, context.daysAgo),
    });
  }

  private async seed(userId: string, daysAgo: (days: number) => string): Promise<void> {
    const events: [string, string | null, number, number | null, -2 | -1 | 0 | 1 | 2][] = [
      ['Moved to a new flat', 'Boxes everywhere for a week, then it felt like home.', 34, 27, 1],
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
    await this.psychology.addNote(userId, {
      day: daysAgo(2),
      text: 'I get irritable when I skip lunch — it is not the work, it is the hunger.',
    });
    await this.psychology.addNote(userId, {
      day: daysAgo(9),
      text: 'After a walk the evening feels longer, in a good way.',
    });
    const checkups: ['who5' | 'gad7', number, number[]][] = [
      ['who5', 60, [2, 2, 3, 2, 3]],
      ['who5', 30, [3, 3, 3, 2, 3]],
      ['who5', 1, [4, 3, 4, 3, 4]],
      ['gad7', 30, [1, 2, 1, 1, 0, 1, 1]],
      ['gad7', 1, [1, 1, 0, 1, 0, 1, 0]],
    ];
    for (const [test, days, answers] of checkups) {
      await this.psychology.addAssessment(userId, { test, takenOn: daysAgo(days), answers });
    }
    const reflection = await this.reflections.forThisWeek(userId);
    await this.reflections.answer(userId, reflection.id, [
      'The walks with Mia gave energy; the late evenings at the laptop took it.',
      '',
      '',
    ]);
  }
}
