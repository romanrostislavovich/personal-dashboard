import { findRealm, namespace } from './battlenet.client';
import { parseRef, toWowExternalId } from './wow.service';

const realms = [
  { slug: 'gordunni', names: ['Gordunni', 'Гордунни'] },
  { slug: 'howling-fjord', names: ['Howling Fjord', 'Ревущий фьорд'] },
];

describe('findRealm', () => {
  it('knows a realm by its name in any language and by its slug', () => {
    expect(findRealm(realms, 'Гордунни')?.slug).toBe('gordunni');
    expect(findRealm(realms, ' ревущий ФЬОРД ')?.slug).toBe('howling-fjord');
    expect(findRealm(realms, 'howling-fjord')?.slug).toBe('howling-fjord');
    expect(findRealm(realms, 'Howling Fjord')?.slug).toBe('howling-fjord');
  });

  it('does not guess', () => {
    expect(findRealm(realms, 'Гордун')).toBeNull();
  });
});

describe('namespace', () => {
  it('names the part of the API of each version of the game', () => {
    expect(namespace('profile', { region: 'eu', version: 'retail' })).toBe('profile-eu');
    expect(namespace('profile', { region: 'eu', version: 'anniversary' })).toBe(
      'profile-classicann-eu',
    );
    expect(namespace('dynamic', { region: 'us', version: 'era' })).toBe('dynamic-classic1x-us');
    expect(namespace('dynamic', { region: 'eu', version: 'progression' })).toBe(
      'dynamic-classic-eu',
    );
  });
});

describe('the external id of a character', () => {
  it('stays as it was for the current game', () => {
    const ref = { region: 'eu', version: 'retail', realm: 'gordunni', name: 'Вася' } as const;
    expect(toWowExternalId(ref)).toBe('eu/gordunni/вася');
    expect(parseRef('eu/gordunni/вася')).toEqual({ ...ref, name: 'вася' });
  });

  it('carries the version of a Classic character', () => {
    const ref = { region: 'eu', version: 'anniversary', realm: 'x', name: 'катализатор' } as const;
    expect(toWowExternalId(ref)).toBe('eu/x/катализатор/anniversary');
    expect(parseRef('eu/x/катализатор/anniversary')).toEqual(ref);
  });
});
