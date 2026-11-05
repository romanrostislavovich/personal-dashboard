import {gameMetrics} from './games.links';

const day = (index: number) => `2026-10-${String(index + 1).padStart(2, '0')}`;
const days = Array.from({length: 12}, (_, index) => day(index));

describe('gameMetrics', () => {
  it("makes a game of enough days a part of Steam's hours, zero on other Steam days", () => {
    const played = [
      ...days.map(one => ({day: one, name: 'Hades II', minutes: 90})),
      {day: day(0), name: 'Once', minutes: 30},
    ];
    const [game, ...rest] = gameMetrics(played, [...days, day(20)]);
    expect(rest).toEqual([]);
    expect(game).toMatchObject({
      key: 'games.steam.hades-ii',
      label: 'Hades II',
      partOf: 'games.steam',
    });
    expect(game.days[0]).toEqual({day: day(0), value: 1.5});
    expect(game.days.at(-1)).toEqual({day: day(20), value: 0});
  });
});
