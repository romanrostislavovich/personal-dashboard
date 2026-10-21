import { digestRequest, evalAnswer, MORNING_DIGEST_INSTRUCTION } from '@pd/api-core';
import { MUSIC_DIGEST_DESCRIPTION } from './music.digest';

/*
 * Evals of the music in the morning digest, with the real instruction and description: the
 * model must tell only today's facts. Run: npm run ai:eval (see eval-model.ts).
 */

const weather = {
  section: {
    id: 'weather.today',
    module: 'weather',
    description:
      "Today's weather (°C, km/h, mm, %) and clothing advice: `outfit` by the coldest " +
      'feels-like temperature of the day and `extras` to take (umbrella, gloves, sunscreen…).',
    collect: async () => null,
  },
  facts: { min: 6, max: 11, rainMm: 4, outfit: 'a warm jacket', extras: ['umbrella'] },
  previous: null,
};

const music = (facts: object, previous: object | null) => ({
  section: {
    id: 'music.highlights',
    module: 'music',
    description: MUSIC_DIGEST_DESCRIPTION,
    collect: async () => null,
  },
  facts,
  previous,
});

const digest = (changes: ReturnType<typeof music>[]) =>
  evalAnswer(MORNING_DIGEST_INSTRUCTION, digestRequest('2026-10-21', [weather, ...changes]));

describe('the morning digest — music', () => {
  it("never tells last week's artist as this week's news", async () => {
    const reply = await digest([
      music(
        { scrobbleMilestone: 25000, artistOfTheWeek: null },
        { scrobbleMilestone: 24000, artistOfTheWeek: 'Evanescence' },
      ),
    ]);
    expect(reply).not.toMatch(/evanescence/i);
    expect(reply).toMatch(/25[\s,. ]?000/);
  });

  it('tells a new artist of the week, and only them', async () => {
    const reply = await digest([
      music(
        { scrobbleMilestone: 24000, artistOfTheWeek: 'Muse' },
        { scrobbleMilestone: 24000, artistOfTheWeek: 'Evanescence' },
      ),
    ]);
    expect(reply).toMatch(/muse/i);
    expect(reply).not.toMatch(/evanescence/i);
  });

  it('says nothing of music when only the weather is new', async () => {
    const reply = await digest([]);
    expect(reply).toMatch(/umbrella/i);
    expect(reply).not.toMatch(/scrobble|artist|last\.fm/i);
  });
});
