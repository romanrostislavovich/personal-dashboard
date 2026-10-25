import { parseProfile, parseTitles } from './openxbl.client';

// The examples of OpenXBL's own OpenAPI spec (https://api.xbl.io/docs/json), and the bare shape
// an older OpenXBL answered with; not from a live key.
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

  it('reads the answers of OpenXBL as its spec shows them, wrapped in content', () => {
    expect(
      parseProfile({
        content: {
          profileUsers: [
            {
              id: '2533274792093122',
              hostId: '2533274792093122',
              settings: [
                {
                  id: 'GameDisplayPicRaw',
                  value: 'https://images-eds-ssl.xboxlive.com/image?url=...',
                },
                { id: 'Gamerscore', value: '45678' },
                { id: 'Gamertag', value: 'ExamplePlayer' },
                { id: 'AccountTier', value: 'Gold' },
              ],
              isSponsoredUser: false,
            },
          ],
        },
        code: 200,
      }),
    ).toMatchObject({ xuid: '2533274792093122', gamertag: 'ExamplePlayer', gamerscore: 45678 });
    const games = parseTitles({
      content: {
        xuid: '2533274798129181',
        titles: [
          {
            titleId: '1144039928',
            name: 'Halo: The Master Chief Collection',
            type: 'Game',
            displayImage: 'http://store-images.s-microsoft.com/image/apps.25919',
            achievement: {
              currentAchievements: 138,
              totalAchievements: 0,
              currentGamerscore: 1200,
              totalGamerscore: 7000,
              progressPercentage: 17,
            },
            titleHistory: { lastTimePlayed: '2025-11-26T02:34:30.2229199Z', visible: true },
          },
        ],
      },
      code: 200,
    });
    expect(games).toEqual([
      {
        titleId: '1144039928',
        name: 'Halo: The Master Chief Collection',
        imageUrl: 'http://store-images.s-microsoft.com/image/apps.25919',
        gamerscore: 1200,
        totalGamerscore: 7000,
        achievements: { unlocked: 138, total: null },
        lastPlayedAt: '2025-11-26T02:34:30.2229199Z',
      },
    ]);
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
