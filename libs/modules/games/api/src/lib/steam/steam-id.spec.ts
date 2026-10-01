import { parseSteamReference, toSteamId64 } from './steam-id';

describe('parseSteamReference', () => {
  it('reads a Steam ID64 as it is or from a profile link', () => {
    const id = { steamId: '76561198065514372' };
    expect(parseSteamReference('76561198065514372')).toEqual(id);
    expect(parseSteamReference('https://steamcommunity.com/profiles/76561198065514372/')).toEqual(
      id,
    );
  });

  it('turns a 32-bit account id into a Steam ID64', () => {
    expect(parseSteamReference('105248644')).toEqual({ steamId: '76561198065514372' });
  });

  it('takes a custom address as a name to resolve', () => {
    expect(parseSteamReference('https://steamcommunity.com/id/some-player/')).toEqual({
      vanity: 'some-player',
    });
    expect(parseSteamReference('some_player')).toEqual({ vanity: 'some_player' });
  });

  it('gives nothing for text that is neither', () => {
    expect(parseSteamReference('')).toBeNull();
    expect(parseSteamReference('two words')).toBeNull();
    expect(parseSteamReference('99999999999999999999')).toBeNull();
  });
});

describe('toSteamId64', () => {
  it('adds the base to a Dota account id', () => {
    expect(toSteamId64(105248644)).toBe('76561198065514372');
    expect(toSteamId64('105248644')).toBe('76561198065514372');
  });
});
