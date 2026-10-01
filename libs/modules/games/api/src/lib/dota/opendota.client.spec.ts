import { wasPlayed, withKey } from './opendota.client';

describe('withKey', () => {
  it('adds the key as the first or as one more parameter', () => {
    expect(withKey('https://api/players/1', 'abc')).toBe('https://api/players/1?api_key=abc');
    expect(withKey('https://api/players/1/matches?limit=5', 'abc')).toBe(
      'https://api/players/1/matches?limit=5&api_key=abc',
    );
  });

  it('leaves the address alone without a key', () => {
    expect(withKey('https://api/players/1', null)).toBe('https://api/players/1');
  });
});

describe('wasPlayed', () => {
  it('keeps a match with a hero and a winner', () => {
    expect(wasPlayed({ hero_id: 14, radiant_win: false })).toBe(true);
  });

  it('drops records without a hero or without a result', () => {
    expect(wasPlayed({ hero_id: null, radiant_win: true })).toBe(false);
    expect(wasPlayed({ hero_id: 0, radiant_win: true })).toBe(false);
    expect(wasPlayed({ hero_id: 14, radiant_win: null })).toBe(false);
  });
});
