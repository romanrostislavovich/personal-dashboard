import { parseProfile, parseTitles } from './openxbl.client';

// Shaped like Xbox Live's own answers (ProfileHub settings, TitleHub with the Achievement and
// TitleHistory decorations), which OpenXBL passes on; written from them, not from a live key.
describe('OpenXBL answers', () => {
  it('reads the profile settings', () => {
    expect(
      parseProfile({
        profileUsers: [
          {
            id: '2533274900000000',
            settings: [
              { id: 'GameDisplayPicRaw', value: 'https://images-eds-ssl.xboxlive.com/pic' },
              { id: 'Gamerscore', value: '12345' },
              { id: 'Gamertag', value: 'Massonochka' },
              { id: 'AccountTier', value: 'Gold' },
            ],
          },
        ],
      }),
    ).toEqual({
      xuid: '2533274900000000',
      gamertag: 'Massonochka',
      avatarUrl: 'https://images-eds-ssl.xboxlive.com/pic',
      gamerscore: 12345,
      tier: 'Gold',
    });
  });

  it('a profile without a gamertag is an error, not an empty account', () => {
    expect(() => parseProfile({ profileUsers: [{ id: '1', settings: [] }] })).toThrow();
    expect(() => parseProfile({})).toThrow();
  });

  it('reads the title history, the last played first, achievements only where there are any', () => {
    const games = parseTitles({
      xuid: '2533274900000000',
      titles: [
        {
          titleId: '219630713',
          name: 'Halo Infinite',
          displayImage: 'https://store-images.s-microsoft.com/halo',
          achievement: {
            currentAchievements: 12,
            totalAchievements: 119,
            currentGamerscore: 180,
            totalGamerscore: 1600,
          },
          titleHistory: { lastTimePlayed: '2024-03-01T20:00:00.0000000Z' },
        },
        {
          titleId: 1144039928,
          name: 'Forza Horizon 5',
          achievement: { currentAchievements: 0, totalAchievements: 0, currentGamerscore: 0 },
          titleHistory: { lastTimePlayed: '2025-01-05T10:00:00.0000000Z' },
        },
        { titleId: '1', name: '' },
      ],
    });
    expect(games.map((game) => game.name)).toEqual(['Forza Horizon 5', 'Halo Infinite']);
    expect(games[0]).toMatchObject({ titleId: '1144039928', achievements: null, imageUrl: null });
    expect(games[1]).toMatchObject({
      gamerscore: 180,
      totalGamerscore: 1600,
      achievements: { unlocked: 12, total: 119 },
    });
  });
});
