import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS, PERIOD_PARAMETERS } from '@pd/api-core';
import {
  psychologyEventInputSchema,
  psychologyNoteInputSchema,
  psychologyPatternsQuerySchema,
} from '@pd/contracts';
import { PsychologyService } from './psychology.service';
import { ReflectionsService } from './reflections.service';

/**
 * The assistant's access to Psychology: the patterns of the mood, notes, events, check-ups and
 * reflections; adding a note or an event.
 */
@Injectable()
export class PsychologyAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly psychology: PsychologyService,
    private readonly reflections: ReflectionsService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'psychology_patterns',
      module: 'psychology',
      description:
        "The mood (the diary's, 1–5) over a period: the average, by the day of the week " +
        '(`byWeekday`, Monday is 0), week by week (`weeks`), the longest run of low days in a ' +
        'row (`longestLowRun`) and the average mood during each event of the period (`events`). ' +
        'Useful for "which days of the week are hardest", "how was my mood during the move", ' +
        '"is it getting better". What goes with good and bad days is core_mood_insights. It ' +
        'describes, it does not diagnose: never name a condition.',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.psychology.patterns(userId, psychologyPatternsQuerySchema.parse(args)),
    });

    this.ai.registerTool({
      name: 'psychology_events',
      module: 'psychology',
      description:
        "The events of the user's life with their periods: id, title, description, startedOn, " +
        'endedOn (null — one day or still going on), feeling (-2 very hard … 2 very good). ' +
        'Useful for "what happened in spring", "when did I change jobs". The latest first.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.psychology.events(userId),
    });

    this.ai.registerTool({
      name: 'psychology_add_event',
      module: 'psychology',
      writes: true,
      description:
        "Records an event of the user's life with its period. `endedOn` is left out for one " +
        'day or for something still going on.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          startedOn: { type: 'string', description: 'YYYY-MM-DD' },
          endedOn: { type: 'string', description: 'YYYY-MM-DD' },
          feeling: { type: 'number', description: '-2 very hard … 2 very good, 0 neutral' },
        },
        required: ['title', 'startedOn'],
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
      confirm: async (userId, args) => {
        const { title, startedOn, endedOn } = await findEvent(userId, args);
        return { title, startedOn, endedOn };
      },
      description: "Deletes an event of the user's life.",
      parameters: idParameters('Event id from psychology_events'),
      handler: async (userId, args) => {
        await this.psychology.removeEvent(userId, (await findEvent(userId, args)).id);
      },
    });

    this.ai.registerTool({
      name: 'psychology_notes',
      module: 'psychology',
      description:
        "The user's notes about themselves (what they noticed: reactions, habits, thoughts), " +
        'a day each, the latest first; the answers to the weekly questions are in ' +
        '`reflections` (week — its Monday, questions, answers); `checkups` — questionnaires ' +
        'filled in over time: who5 (well-being, 0–100, higher is better), gad7 (anxiety, 0–21) ' +
        'and phq9 (low mood, 0–27), each with the date, the score and its band. They are ' +
        'self-observation, not a diagnosis: describe the change over time, never name a ' +
        'condition, and if the user seems to be struggling, gently suggest talking to a ' +
        'professional or someone they trust.',
      parameters: NO_PARAMETERS,
      handler: async (userId) => ({
        notes: await this.psychology.notes(userId),
        reflections: await this.reflections.list(userId),
        checkups: (await this.psychology.assessments(userId)).map(
          ({ test, takenOn, score, band }) => ({ test, takenOn, score, band }),
        ),
      }),
    });

    this.ai.registerTool({
      name: 'psychology_add_note',
      module: 'psychology',
      writes: true,
      description:
        'Saves a note of the user about themselves on a day (today unless they say another).',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'YYYY-MM-DD' },
          text: { type: 'string' },
        },
        required: ['day', 'text'],
      },
      handler: async (userId, args) => {
        await this.psychology.addNote(userId, psychologyNoteInputSchema.parse(args));
        return { saved: true };
      },
    });
  }
}
