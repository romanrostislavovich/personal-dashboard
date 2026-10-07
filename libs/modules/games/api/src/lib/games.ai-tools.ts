import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  AiService,
  findById,
  idParameters,
  NO_PARAMETERS,
  PERIOD_PARAMETERS,
  ServerActions,
} from '@pd/api-core';
import {
  activityPeriodSchema,
  DOTA_MATCH_MODES,
  DOTA_RESULTS,
  dotaMatchesQuerySchema,
  GAMES,
  gameAccountInputSchema,
  WOW_REGIONS,
  WOW_VERSIONS,
} from '@pd/contracts';
import { DotaHeroesService } from './dota/dota-heroes.service';
import { DotaOverviewService } from './dota/dota-overview.service';
import { GameAccountsService } from './game-accounts.service';
import { GAMES_ACTIONS } from './games.server-actions';
import { SteamPlayService } from './steam/steam-play.service';

/** Steam games an account shows in the list of accounts. */
const STEAM_TOP = 15;

/** AI access to games: Steam, Dota 2 and WoW; adding, refreshing and removing accounts (assistant). */
@Injectable()
export class GamesAiTools implements OnModuleInit {
  constructor(
    private readonly ai: AiService,
    private readonly accounts: GameAccountsService,
    private readonly actions: ServerActions,
    private readonly dota: DotaOverviewService,
    private readonly heroes: DotaHeroesService,
    private readonly steamPlay: SteamPlayService,
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'games_steam_days',
      module: 'games',
      description:
        'Play time on Steam day by day over a period: day, game, minutes — on any device ' +
        '(a console, a computer without the tracker). Collected since the Steam account was ' +
        'connected, from the growth of the totals at each sync; what is over the tracked games ' +
        'time of a day is already added to activity_stats. Useful for "what did I play last ' +
        'week", "how long did I play on Saturday".',
      parameters: PERIOD_PARAMETERS,
      handler: (userId, args) => {
        const { from, to } = activityPeriodSchema.parse(args);
        return this.steamPlay.days(userId, from, to);
      },
    });

    this.ai.registerTool({
      name: 'games_accounts',
      module: 'games',
      description:
        'Game accounts (with id). Dota 2: medal (rankTier = medal×10+stars, 8 = Immortal), ' +
        'wins/losses over 30 days, recent matches with heroes and KDA, favourite heroes. ' +
        'WoW: character, ilvl, achievement points, recent achievements and `details` — gear ' +
        'by slot, stats, talents, Mythic+ rating and best runs, raid progress, PvP ratings, ' +
        'collections (mounts, pets, toys, titles, quests), reputations, professions, guild. ' +
        'Steam: level, hours ' +
        'in games in total and over two weeks, achievements unlocked, the most played games ' +
        '(the whole library — games_steam_library).',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.accounts.list(userId)).map((account) => {
          if (account.summary?.game === 'steam') {
            return {
              ...account,
              summary: { ...account.summary, games: account.summary.games.slice(0, STEAM_TOP) },
            };
          }
          // The chart and the pictures are of no use to the model.
          return account.summary?.game === 'wow'
            ? {
                ...account,
                summary: { ...account.summary, history: undefined, avatarUrl: undefined },
              }
            : account;
        }),
    });

    this.ai.registerTool({
      name: 'games_dota_stats',
      module: 'games',
      description:
        'Dota 2 statistics over all Dota accounts together (or one, by accountId): totals and KDA, ' +
        'win rate per game mode, every hero played (matches, wins, average KDA, GPM/XPM), ' +
        'personal records and recent matches with the account they were played on.',
      parameters: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Game account id from games_accounts' },
        },
      },
      handler: async (userId, args) => {
        const { activity, ...overview } = await this.dota.overview(
          userId,
          typeof args['accountId'] === 'string' ? args['accountId'] : undefined,
        );
        // The day-by-day calendar is for the page; a count of active days is enough here.
        return { ...overview, activeDaysLastYear: activity.length };
      },
    });

    this.ai.registerTool({
      name: 'games_dota_matches',
      module: 'games',
      description:
        'Dota 2 matches one by one, newest first, from the whole stored history: hero, result, ' +
        'KDA, duration, mode, GPM/XPM, when played. Narrow them with `hero` (its name), ' +
        '`mode`, `result` and the days `from` / `to` — for "how did I play last week", "my ' +
        'last games on Pudge", "how many ranked wins in September". `total` is how many ' +
        'match, `wins` and `losses` are counted over all of them, not only the ones shown.',
      parameters: {
        type: 'object',
        properties: {
          hero: { type: 'string', description: 'The name of the hero, e.g. "Pudge"' },
          mode: { type: 'string', enum: [...DOTA_MATCH_MODES] },
          result: { type: 'string', enum: [...DOTA_RESULTS] },
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
          accountId: { type: 'string', description: 'Game account id from games_accounts' },
          limit: { type: 'number', description: '10–100, default 30' },
        },
      },
      handler: async (userId, args) => {
        const { hero, limit, ...filters } = args;
        const heroId = typeof hero === 'string' ? await this.heroId(hero) : undefined;
        if (typeof hero === 'string' && !heroId) {
          return { error: `No Dota hero is called "${hero}"` };
        }
        const query = dotaMatchesQuerySchema.parse({ ...filters, heroId, pageSize: limit ?? 30 });
        const page = await this.dota.matches(userId, query);
        // The wins and losses of everything that matches, not of the page.
        const count = async (result: 'win' | 'loss') =>
          query.result && query.result !== result
            ? 0
            : (await this.dota.matches(userId, { ...query, result, pageSize: 10 })).total;
        return {
          total: page.total,
          wins: await count('win'),
          losses: await count('loss'),
          shown: page.items.length,
          matches: page.items.map(({ hero: played, ...match }) => ({
            ...match,
            hero: played.name,
          })),
        };
      },
    });

    this.ai.registerTool({
      name: 'games_steam_library',
      module: 'games',
      description:
        'Played games of the Steam accounts, the most played first: name, minutes in total and ' +
        'over the last two weeks, when it was last played, achievements unlocked out of all. ' +
        'Use it for "what do I play", "how many hours in X", "which games did I never finish".',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.accounts.list(userId)).flatMap((account) =>
          account.summary?.game === 'steam'
            ? [{ account: account.summary.personaName, games: account.summary.games }]
            : [],
        ),
    });

    this.ai.registerTool({
      name: 'games_add_account',
      module: 'games',
      writes: true,
      description:
        'Adds a game account and loads its data. Dota 2 and Steam need steamId; WoW needs ' +
        'region, realm and character name. Steam works only after the Steam Web API key is ' +
        'set in the dashboard, WoW — after the Battle.net keys.',
      parameters: {
        type: 'object',
        properties: {
          game: { type: 'string', enum: [...GAMES] },
          steamId: {
            type: 'string',
            description:
              'Dota 2: Steam ID32/ID64 or an OpenDota/Dotabuff/Steam profile link. ' +
              'Steam: Steam ID64, a profile link or the custom profile name',
          },
          region: { type: 'string', enum: [...WOW_REGIONS], description: 'WoW' },
          version: {
            type: 'string',
            enum: [...WOW_VERSIONS],
            description:
              'WoW: the version of the game the character is in — retail (the current game, ' +
              'the default), anniversary (Classic Anniversary), era (Classic Era, Hardcore, ' +
              'Season of Discovery), progression (Cataclysm / Mists of Pandaria Classic)',
          },
          realm: {
            type: 'string',
            description: 'WoW realm as the game shows it ("Гордунни", "Howling Fjord") or its slug',
          },
          name: { type: 'string', description: 'WoW character name' },
        },
        required: ['game'],
      },
      handler: async (userId, args) => {
        // OpenDota / Battle.net are called on the server (see ServerActions).
        await this.actions.run(
          userId,
          GAMES_ACTIONS.addAccount,
          gameAccountInputSchema.parse(args),
        );
        return { added: true };
      },
    });

    const find = async (userId: string, args: Record<string, unknown>) =>
      findById(await this.accounts.list(userId), args['id'], 'Game account');

    this.ai.registerTool({
      name: 'games_sync_account',
      module: 'games',
      writes: true,
      description: 'Reloads a game account now (the whole match history for Dota 2).',
      parameters: idParameters('Game account id from games_accounts'),
      handler: async (userId, args) => {
        const account = await find(userId, args);
        await this.actions.run(userId, GAMES_ACTIONS.syncAccount, { id: account.id });
        return find(userId, args);
      },
    });

    this.ai.registerTool({
      name: 'games_remove_account',
      module: 'games',
      writes: true,
      confirm: async (userId, args) => {
        const { game, displayName } = await find(userId, args);
        return { game, displayName };
      },
      description: 'Removes a game account and its loaded history.',
      parameters: idParameters('Game account id from games_accounts'),
      handler: async (userId, args) => {
        await this.accounts.remove(userId, (await find(userId, args)).id);
      },
    });
  }

  /** The id of a hero by its name, whatever the case; a part of the name when nothing is exact. */
  private async heroId(name: string): Promise<number | undefined> {
    const hero = await this.heroes.resolver();
    const wanted = name.trim().toLowerCase();
    const all = (await this.heroes.ids()).map((id) => hero(id));
    return (
      all.find((item) => item.name.toLowerCase() === wanted) ??
      all.find((item) => item.name.toLowerCase().includes(wanted))
    )?.id;
  }
}
