import { Injectable } from '@nestjs/common';
import { DotaHero } from '@pd/contracts';
import { HeroInfo, openDota } from './opendota.client';

const HEROES_CACHE_MS = 24 * 60 * 60 * 1000;

/** Hero names and pictures from OpenDota. The list rarely changes (patches) — cached for a day. */
@Injectable()
export class DotaHeroesService {
  private cache: { loadedAt: number; map: Map<number, HeroInfo> } | null = null;

  /** A lookup for one response: `hero(id)` → name and picture (a placeholder for a new hero). */
  async resolver(): Promise<(id: number) => DotaHero> {
    if (!this.cache || Date.now() - this.cache.loadedAt > HEROES_CACHE_MS) {
      this.cache = { loadedAt: Date.now(), map: await openDota.getHeroes() };
    }
    const heroes = this.cache.map;
    return (id) => ({
      id,
      name: heroes.get(id)?.name ?? `Hero #${id}`,
      imageUrl: heroes.get(id)?.imageUrl ?? '',
    });
  }
}
