import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService } from '@pd/api-core';
import {
  addDays,
  DailyMetric,
  LocalDate,
  parseLocalDate,
  QUESTIONNAIRES,
  toLocalDate,
} from '@pd/contracts';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { psychologyAssessments } from './psychology.schema';

/** The questionnaires ask about the last two weeks: a score is of the 14 days up to its day. */
const WEEKS_ASKED_DAYS = 14;

/**
 * What psychology tells the other sections (see LinksService): its pages for the assistant's
 * links, and the scores of the questionnaires (WHO-5, GAD-7, PHQ-9) as daily numbers — each
 * over the two weeks it asks about, so the links engine compares it with those days.
 */
@Injectable()
export class PsychologyLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
  ) {}

  onModuleInit(): void {
    this.links.registerDailyMetrics({
      module: 'psychology',
      metrics: async (userId, period) => {
        const a = psychologyAssessments;
        const rows = await this.db
          .select({ test: a.test, takenOn: a.takenOn, answers: a.answers })
          .from(a)
          .where(
            and(
              eq(a.userId, userId),
              gte(a.takenOn, period.from),
              lte(a.takenOn, shift(period.to, WEEKS_ASKED_DAYS - 1)),
            ),
          )
          .orderBy(asc(a.takenOn));
        return QUESTIONNAIRES.flatMap((questionnaire): DailyMetric[] => {
          const days = new Map<LocalDate, number>();
          // Oldest first: where two overlap, the later answer is of the nearer days.
          for (const row of rows.filter((item) => item.test === questionnaire.id)) {
            const score =
              row.answers.reduce((sum, answer) => sum + answer, 0) * questionnaire.scale;
            for (let back = WEEKS_ASKED_DAYS - 1; back >= 0; back--) {
              const day = shift(row.takenOn, -back);
              if (day >= period.from && day <= period.to) {
                days.set(day, score);
              }
            }
          }
          return days.size
            ? [
                {
                  key: `psychology.${questionnaire.id}`,
                  module: 'psychology',
                  labelKey: `psychology.links.${questionnaire.id}`,
                  unit: 'score',
                  days: [...days].map(([day, value]) => ({ day, value })),
                },
              ]
            : [];
        });
      },
    });

    this.links.registerPages([
      { module: 'psychology', path: '/psychology/patterns', description: 'patterns of the mood' },
      {
        module: 'psychology',
        path: '/psychology/checkups',
        description: 'questionnaires over time',
      },
      { module: 'psychology', path: '/psychology/events', description: 'events of a life, export' },
    ]);
  }
}

function shift(day: LocalDate, by: number): LocalDate {
  return toLocalDate(addDays(parseLocalDate(day), by));
}
