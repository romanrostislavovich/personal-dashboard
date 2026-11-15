import {describe, expect, it} from 'vitest';
import {authorizeUrl, parseAccountProfile} from './battlenet-account.client';

describe('authorizeUrl', () => {
  it('asks for the profile scope and comes back to the given address', () => {
    const url = new URL(
      authorizeUrl(
        'client',
        'https://pd.example/api/games/battlenet/callback',
        's1',
      ),
    );
    expect(url.origin).toBe('https://oauth.battle.net');
    expect(url.searchParams.get('scope')).toBe('wow.profile');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://pd.example/api/games/battlenet/callback',
    );
    expect(url.searchParams.get('state')).toBe('s1');
  });
});

describe('parseAccountProfile', () => {
  it('reads the characters of every WoW account of the answer', () => {
    const characters = parseAccountProfile({
      region: 'eu',
      version: 'retail',
      status: 200,
      body: {
        wow_accounts: [
          {
            characters: [
              {
                id: 7,
                name: 'Массоночка',
                level: 80,
                realm: {slug: 'eversong', name: 'Вечная Песня'},
                playable_class: {name: 'Жрец'},
              },
            ],
          },
          {characters: [{id: 8, name: 'Twink', level: 1}]},
        ],
      },
    });
    expect(characters).toEqual([
      {
        id: 7,
        region: 'eu',
        version: 'retail',
        name: 'Массоночка',
        surname: null,
        realm: 'Вечная Песня',
        realmSlug: 'eversong',
        level: 80,
        className: 'Жрец',
      },
      {
        id: 8,
        region: 'eu',
        version: 'retail',
        name: 'Twink',
        surname: null,
        realm: null,
        realmSlug: null,
        level: 1,
        className: null,
      },
    ]);
  });

  it('keeps the surname of a Forever character and names in every language', () => {
    const [character] = parseAccountProfile({
      region: 'eu',
      version: 'forever',
      status: 200,
      body: {
        wow_accounts: [
          {
            characters: [
              {
                id: 1,
                name: 'Око',
                surname: 'Масонское',
                level: 12,
                playable_class: {name: {en_US: 'Mage', ru_RU: 'Маг'}},
              },
            ],
          },
        ],
      },
    });
    expect(character).toMatchObject({
      version: 'forever',
      name: 'Око',
      surname: 'Масонское',
      className: 'Маг',
    });
  });

  it('finds nothing in a region without the account', () => {
    expect(
      parseAccountProfile({
        region: 'kr',
        version: 'retail',
        status: 404,
        body: null,
      }),
    ).toEqual([]);
  });
});
