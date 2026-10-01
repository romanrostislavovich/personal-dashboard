import { Logger } from '@nestjs/common';
import { DotaHeroesService } from './dota-heroes.service';
import { openDota, toHeroes } from './opendota.client';

const HEROES = toHeroes({
  '1': { id: 1, localized_name: 'Anti-Mage', img: '/heroes/antimage.png?' },
});

describe('DotaHeroesService', () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterEach(() => vi.restoreAllMocks());

  it('takes the heroes from the mirror when OpenDota is down', async () => {
    vi.spyOn(openDota, 'getHeroes').mockRejectedValue(new Error('OpenDota 500'));
    vi.spyOn(openDota, 'getHeroesFromMirror').mockResolvedValue(HEROES);
    const hero = await new DotaHeroesService().resolver();
    expect(hero(1).name).toBe('Anti-Mage');
  });

  it('still answers with placeholders when no source is reachable', async () => {
    vi.spyOn(openDota, 'getHeroes').mockRejectedValue(new Error('OpenDota 500'));
    vi.spyOn(openDota, 'getHeroesFromMirror').mockRejectedValue(new Error('offline'));
    const hero = await new DotaHeroesService().resolver();
    expect(hero(1)).toEqual({ id: 1, name: 'Hero #1', imageUrl: '' });
  });

  it('keeps the previous list when a refresh fails', async () => {
    const primary = vi.spyOn(openDota, 'getHeroes').mockResolvedValue(HEROES);
    vi.spyOn(openDota, 'getHeroesFromMirror').mockRejectedValue(new Error('offline'));
    const service = new DotaHeroesService();
    await service.resolver();

    primary.mockRejectedValue(new Error('OpenDota 500'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    expect((await service.resolver())(1).name).toBe('Anti-Mage');
  });
});

describe('toHeroes', () => {
  it('builds the picture address without the trailing question mark', () => {
    expect(HEROES.get(1)).toEqual({
      name: 'Anti-Mage',
      imageUrl: 'https://cdn.cloudflare.steamstatic.com/heroes/antimage.png',
    });
  });
});
