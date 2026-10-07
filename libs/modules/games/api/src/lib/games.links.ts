import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService, OtherComputersService } from '@pd/api-core';
import { SteamPlayService } from './steam/steam-play.service';

/** A name shorter than this would be found inside any other word. */
const MIN_NAME = 4;

/**
 * What games tell the other sections (see LinksService): the play time of Steam for the time
 * at the computer — also on a console or a computer without the tracker — and whether a game
 * that is paid for is played.
 */
@Injectable()
export class GamesLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly computers: OtherComputersService,
    private readonly play: SteamPlayService,
  ) {}

  onModuleInit(): void {
    this.computers.register({
      id: 'steam',
      module: 'games',
      days: async (userId, from, to) => {
        const perDay = new Map<string, number>();
        for (const { day, minutes } of await this.play.days(userId, from, to)) {
          perDay.set(day, (perDay.get(day) ?? 0) + minutes);
        }
        return [...perDay].map(([day, minutes]) => ({
          computer: 'Steam',
          day,
          seconds: minutes * 60,
          category: 'games' as const,
        }));
      },
    });

    this.links.registerUsage({
      module: 'games',
      usage: async (userId, name, period) => {
        const days = await this.play.days(userId, period.from, period.to);
        const all = name.includes('steam');
        const played = days.filter((day) => {
          const game = day.name.toLowerCase();
          return all || (game.length >= MIN_NAME && (name.includes(game) || game.includes(name)));
        });
        // Not played is an answer only for Steam itself: any other name may be no game at all.
        if (!played.length && !all) {
          return null;
        }
        return {
          unitKey: 'games.usage.minutes',
          amount: played.reduce((sum, day) => sum + day.minutes, 0),
          lastUsedAt: played[0]?.day ?? null,
        };
      },
    });

    this.links.registerPages([
      { module: 'games', path: '/games', description: 'Steam, Dota 2 and WoW accounts' },
    ]);
  }
}
