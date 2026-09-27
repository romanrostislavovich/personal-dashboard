import { parseDotaAccountId, splitRankTier } from './steam-id';

describe('parseDotaAccountId', () => {
  it('accepts a plain account id', () => {
    expect(parseDotaAccountId('105248644')).toBe(105248644);
  });

  it('converts Steam ID64 to the 32-bit account id', () => {
    expect(parseDotaAccountId('76561198065514372')).toBe(105248644);
  });

  it('extracts the id from OpenDota, Dotabuff and Steam profile links', () => {
    expect(parseDotaAccountId('https://www.opendota.com/players/105248644')).toBe(105248644);
    expect(parseDotaAccountId('https://www.dotabuff.com/players/105248644/matches')).toBe(
      105248644,
    );
    expect(parseDotaAccountId('https://steamcommunity.com/profiles/76561198065514372/')).toBe(
      105248644,
    );
  });

  it('rejects vanity Steam links and garbage', () => {
    expect(parseDotaAccountId('https://steamcommunity.com/id/nickname')).toBeNull();
    expect(parseDotaAccountId('hello')).toBeNull();
  });
});

describe('splitRankTier', () => {
  it('splits medal and stars', () => {
    expect(splitRankTier(54)).toEqual({ medal: 5, stars: 4 });
    expect(splitRankTier(80)).toEqual({ medal: 8, stars: 0 });
  });

  it('returns null for unranked players', () => {
    expect(splitRankTier(null)).toBeNull();
  });
});
