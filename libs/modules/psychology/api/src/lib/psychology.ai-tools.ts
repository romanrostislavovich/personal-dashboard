import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import { psychologyEventInputSchema, psychologyPatternsQuerySchema } from '@pd/contracts';
import { PsychologyService } from './psychology.service';
import { psychologyEvents } from './psychology.schema';

/**
 * The assistant's access to Psychology: the patterns of the mood, events and check-ups;
 * adding an event.
 */
@Injectable()
export class PsychologyAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly psychology: PsychologyService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'psychology_patterns',
      module: 'psychology',
      description:
        "The mood (the diary's, 1–5) over a period: the average, by the day of the week " +
        '(`byWeekday`, Monday is 0), week by week (`weeks`), the longest run of low days in a ' +
        'row (`longestLowRun`), the average mood during each event of the period (`events`) ' +
        'and during the treatment other sections tell (`periods`: a medication, a diagnosis). ' +
        'Useful for "which days of the week are hardest", "how was my mood during the move", ' +
        '"is it getting better". What goes with good and bad days is core_mood_insights. It ' +
        'describes, it does not diagnose: never name a condition.',
      parameters: PERIOD_PARAMETERS,
      handler: async (userId, args) => {
        const patterns = await this.psychology.patterns(
          userId,
          psychologyPatternsQuerySchema.parse(args),
        );
        // A section hidden from the assistant (or with its own AI) keeps its periods away.
        const hidden = new Set(await this.ai.hiddenFromShared(userId));
        return { ...patterns, periods: patterns.periods.filter((p) => !hidden.has(p.module)) };
      },
    });

    this.ai.registerTool({
      name: 'psychology_events',
      module: 'psychology',
      description:
        "The events of the user's life with their periods: id, title, description, startedOn, " +
        'endedOn (null — one day or still going on), feeling (-2 very hard … 2 very good). ' +
        'An event remembered without dates has ageFrom and ageTo instead (the age in full ' +
        'years, e.g. 3; ageTo null — within one year of life) and startedOn null. ' +
        'Useful for "what happened in spring", "when did I change jobs". The latest first.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.psychology.events(userId),
    });

    this.ai.registerTool({
      name: 'psychology_add_event',
      module: 'psychology',
      writes: true,
      undoTables: [psychologyEvents],
      description:
        "Records an event of the user's life with its period. `endedOn` is left out for one " +
        'day or for something still going on. For something remembered by age rather than ' +
        'by dates ("when I was three", "between 6 and 10") give `ageFrom` (and `ageTo`) ' +
        'instead of the dates — never both.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          startedOn: { type: 'string', description: 'YYYY-MM-DD' },
          endedOn: { type: 'string', description: 'YYYY-MM-DD' },
          ageFrom: { type: 'number', description: 'Age in full years, instead of the dates' },
          ageTo: { type: 'number', description: 'The last age, for several years' },
          feeling: { type: 'number', description: '-2 very hard … 2 very good, 0 neutral' },
        },
        required: ['title'],
      },
      handler: (userId, args) =>
        this.psychology.addEvent(userId, psychologyEventInputSchema.parse(args)),
    });

    const findEvent = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.psychology.events(userId), args['id'], 'Event');
    this.ai.registerTool({
      name: 'psychology_delete_event',
      module: 'psychology',
      writes: true,
      undoTables: [psychologyEvents],
      confirm: async (userId, args) => {
        const { title, startedOn, endedOn, ageFrom, ageTo } = await findEvent(userId, args);
        return startedOn ? { title, startedOn, endedOn } : { title, ageFrom, ageTo };
      },
      description: "Deletes an event of the user's life.",
      parameters: idParameters('Event id from psychology_events'),
      handler: async (userId, args) => {
        await this.psychology.removeEvent(userId, (await findEvent(userId, args)).id);
      },
    });

    this.ai.registerTool({
      name: 'psychology_checkups',
      module: 'psychology',
      description:
        'The questionnaires the user filled in over time: who5 (well-being, 0–100, higher is ' +
        'better), gad7 (anxiety, 0–21) and phq9 (low mood, 0–27), each with the date, the ' +
        'score and its band; the latest first. They are self-observation, not a diagnosis: ' +
        'describe the change over time, never name a condition, and if the user seems to be ' +
        'struggling, gently suggest talking to a professional or someone they trust.',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.psychology.assessments(userId)).map(({ test, takenOn, score, band }) => ({
          test,
          takenOn,
          score,
          band,
        })),
    });
  }
}
