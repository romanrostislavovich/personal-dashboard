import { playedSince } from './steam-play';

describe('playedSince', () => {
  const before = new Map([
    [570, 1000],
    [730, 50],
  ]);

  it('takes the growth of the total as the play since the last sync', () => {
    const games = [
      { appId: 570, playtimeMinutes: 1090 },
      { appId: 730, playtimeMinutes: 50 },
    ];
    expect(playedSince(before, games)).toEqual([{ appId: 570, minutes: 90 }]);
  });

  it('does not take the whole total of a game seen for the first time', () => {
    expect(playedSince(before, [{ appId: 1, playtimeMinutes: 5000 }])).toEqual([]);
  });

  it('never puts more than a day on a day', () => {
    expect(playedSince(before, [{ appId: 570, playtimeMinutes: 9000 }])).toEqual([
      { appId: 570, minutes: 1440 },
    ]);
  });
});
