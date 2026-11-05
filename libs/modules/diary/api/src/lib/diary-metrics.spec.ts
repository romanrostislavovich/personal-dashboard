import {moodVolatility, shift, tagDays} from './diary-metrics';

const day = (index: number) => shift('2026-10-01', index);

describe('tagDays', () => {
  const entries = Array.from({length: 12}, (_, index) => ({
    day: day(index),
    tags: [
      ...(index % 2 ? ['Sport'] : []),
      ...(index < 3 ? ['rare'] : []),
      'always',
    ],
  }));

  it('turns a tag used often enough into yes/no days of the entries', () => {
    const [sport] = tagDays(entries);
    expect(sport.tag).toBe('sport');
    expect(sport.days).toHaveLength(12);
    expect(sport.days.slice(0, 2)).toEqual([
      {day: day(0), value: 0},
      {day: day(1), value: 1},
    ]);
  });

  it('leaves out a rare tag and one on every entry (it tells nothing)', () => {
    expect(tagDays(entries).map(tag => tag.tag)).toEqual(['sport']);
  });
});

describe('moodVolatility', () => {
  it('is zero for a steady mood and grows when it swings', () => {
    const steady = Array.from({length: 7}, (_, index) => ({
      day: day(index),
      mood: 3,
    }));
    const swinging = steady.map((entry, index) => ({
      ...entry,
      mood: index % 2 ? 1 : 5,
    }));
    expect(moodVolatility(steady, 14).at(-1)?.value).toBe(0);
    expect(moodVolatility(swinging, 14).at(-1)?.value).toBeGreaterThan(1.5);
  });

  it('needs five days with a mood in its window', () => {
    const few = [0, 1, 2, 3].map(index => ({day: day(index), mood: 4}));
    expect(moodVolatility(few, 14)).toEqual([]);
    expect(moodVolatility([...few, {day: day(30), mood: null}], 14)).toEqual(
      [],
    );
  });
});
