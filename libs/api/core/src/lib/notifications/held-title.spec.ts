import { heldTitle } from './held-title';

const words = { yesterday: (d: string) => `Вчера, ${d}`, earlier: (d: string) => d };
const warsaw = 'Europe/Warsaw';

describe('heldTitle', () => {
  it('names the day of a question that comes on another day', () => {
    const at = new Date('2026-10-27T08:00:00Z');
    expect(heldTitle('Q?', new Date('2026-10-26T20:00:00Z'), at, warsaw, words)).toBe(
      'Вчера, 26.10 — Q?',
    );
    expect(heldTitle('Q?', new Date('2026-10-24T20:00:00Z'), at, warsaw, words)).toBe('24.10 — Q?');
  });

  it('leaves a question of the same day as it is (after midnight in Warsaw counts as today)', () => {
    // 00:30 in Warsaw on 27.10 is 23:30 UTC on 26.10.
    expect(
      heldTitle(
        'Q?',
        new Date('2026-10-26T23:30:00Z'),
        new Date('2026-10-27T08:00:00Z'),
        warsaw,
        words,
      ),
    ).toBe('Q?');
  });
});
