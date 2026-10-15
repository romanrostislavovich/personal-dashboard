import { Injectable, OnModuleInit } from '@nestjs/common';
import { MorningDigestService } from '@pd/api-core';
import { Habit, isBuilding } from '@pd/contracts';
import { HabitsService } from './habits.service';

/** The marks of a run worth telling: a new one is news, the count in between is not. */
const MILESTONES = [7, 30, 90, 180, 365, 1000];

/**
 * Habits in the morning digest: the runs, told when one passes a milestone (a week, a month…)
 * or starts again — not every morning, as the number itself grows each day.
 */
@Injectable()
export class HabitsDigest implements OnModuleInit {
  constructor(
    private readonly digest: MorningDigestService,
    private readonly habits: HabitsService,
  ) {}

  onModuleInit(): void {
    this.digest.register({
      id: 'habits.runs',
      module: 'habits',
      description:
        'Habits the user quits (alcohol, smoking, their own) or builds (sport, reading…): for ' +
        'each its `name`, whether it is `toBuild`, the milestone its current run has passed ' +
        '(days in a row, weeks for one done a few times a week; 0 — the run is short or ' +
        'started again) and the best run. Congratulate a new milestone warmly; a run started ' +
        'again — gently, without blame.',
      collect: async (userId) => {
        const habits = await this.habits.list(userId);
        return habits.length ? habits.map(fact) : null;
      },
    });
  }
}

function fact(habit: Habit) {
  const run = habit.stats.currentStreak;
  return {
    name: habit.kind === 'custom' ? habit.name : habit.kind,
    toBuild: isBuilding(habit.goal),
    milestone: [...MILESTONES].reverse().find((goal) => run >= goal) ?? 0,
    best: [...MILESTONES].reverse().find((goal) => habit.stats.bestStreak >= goal) ?? 0,
  };
}
