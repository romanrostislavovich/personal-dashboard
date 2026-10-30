import {Injectable, OnModuleInit} from '@nestjs/common';
import {AiService, PERIOD_PARAMETERS} from '@pd/api-core';
import {z} from 'zod';
import {BandService} from './band.service';
import {WearableService} from './wearable.service';

const dayArgs = z.object({day: z.iso.date()});
const periodArgs = z.object({from: z.iso.date(), to: z.iso.date()});

/**
 * The assistant's access to the band (the web chat, Telegram, the phone's voice): the days of a
 * period, and one day by hours with its reactions — "how did I sleep", "was I stressed today".
 */
@Injectable()
export class BandAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly wearable: WearableService,
    private readonly band: BandService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'health_band_days',
      module: 'health',
      description:
        "The user's band (a Fitbit) day by day: sleep minutes and its stages, sleepStart / " +
        'sleepEnd (HH:MM), sleepScore 0–100, restingHeartRate, hrvMs (RMSSD of the night), spo2, ' +
        'steps, calories, stressScore 0–100 (under 25 calm, 60 normal, 85 raised, then high — ' +
        "the pulse at rest against the user's own baseline and the night's HRV), resilience " +
        "0–100 (the night's recovery against the day's load; 50 even), reactions (times the " +
        'pulse rose at rest), mindfulnessMinutes, skinTempDelta. A number the band did not tell ' +
        'is null. Never diagnose from it.',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) =>
        this.wearable.days(userId, periodArgs.parse(args)),
    });

    this.ai.registerTool({
      name: 'health_band_day',
      module: 'health',
      description:
        "One day of the band by hours: each hour's steps and stress index, the night that " +
        'ended the day (its stages), exercises, mindfulness sessions, and the body reactions — ' +
        'the pulse well above the resting one without moving, with what the user said it was ' +
        '(feeling). The pulse of every minute is left out; ask health_band_days for the totals.',
      parameters: {
        type: 'object',
        properties: {day: {type: 'string', description: 'The day, YYYY-MM-DD'}},
        required: ['day'],
      },
      handler: async (userId, args) => {
        const {minutes, ...day} = await this.band.day(
          userId,
          dayArgs.parse(args).day,
        );
        return {
          ...day,
          minutesWithPulse: minutes.filter(m => m.bpm !== null).length,
        };
      },
    });
  }
}
