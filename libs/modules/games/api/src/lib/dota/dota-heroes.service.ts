import { Injectable, Logger } from '@nestjs/common';
import { DotaHero } from '@pd/contracts';
import { HeroInfo, openDota } from './opendota.client';

const HEROES_CACHE_MS = 24 * 60 * 60 * 1000;
/** After a failed load: how soon the list is asked for again. */
const RETRY_MS = 5 * 60 * 1000;

/**
 * Hero names and pictures. The list rarely changes (patches) — cached for a day.
 *
 * It comes from OpenDota, but the saved matches must stay readable when OpenDota is down: the
 * list is then taken from its mirror, then from the previous copy, and without any of them the
 * heroes are shown as "Hero #id" until a source answers again.
 */
@Injectable()
export class DotaHeroesService {
  private readonly logger = new Logger(DotaHeroesService.name);
  private cache: { refreshAt: number; map: Map<number, HeroInfo> } | null = null;

  /** A lookup for one response: `hero(id)` → name and picture (a placeholder for a new hero). */
  async resolver(): Promise<(id: number) => DotaHero> {
    if (!this.cache || Date.now() > this.cache.refreshAt) {
      this.cache = await this.load(this.cache?.map ?? new Map());
    }
    const heroes = this.cache.map;
    return (id) => ({
      id,
      name: heroes.get(id)?.name ?? `Hero #${id}`,
      imageUrl: heroes.get(id)?.imageUrl ?? '',
    });
  }

  /** Ids of all heroes — for walking the match history hero by hero. */
  async ids(): Promise<number[]> {
    await this.resolver();
    return [...(this.cache?.map.keys() ?? [])];
  }

  private async load(previous: Map<number, HeroInfo>) {
    for (const source of [() => openDota.getHeroes(), () => openDota.getHeroesFromMirror()]) {
      try {
        return { refreshAt: Date.now() + HEROES_CACHE_MS, map: await source() };
      } catch (error) {
        this.logger.warn(`Dota hero list is unavailable: ${error}`);
      }
    }
    return { refreshAt: Date.now() + RETRY_MS, map: previous };
  }
}
