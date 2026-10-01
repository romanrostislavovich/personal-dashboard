import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS, ServerActions } from '@pd/api-core';
import { GAMES, gameAccountInputSchema, WOW_REGIONS } from '@pd/contracts';
import { DotaOverviewService } from './dota/dota-overview.service';
import { GameAccountsService } from './game-accounts.service';
import { GAMES_ACTIONS } from './games.server-actions';

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
  ) {}

  onModuleInit(): void {
    this.ai.registerTool({
      name: 'games_accounts',
      module: 'games',
      description:
        'Game accounts (with id). Dota 2: medal (rankTier = medal×10+stars, 8 = Immortal), ' +
        'wins/losses over 30 days, recent matches with heroes and KDA, favourite heroes. ' +
        'WoW: character, ilvl, achievement points and recent achievements. Steam: level, hours ' +
        'in games in total and over two weeks, achievements unlocked, the most played games ' +
        '(the whole library — games_steam_library).',
      parameters: NO_PARAMETERS,
      handler: async (userId) =>
        (await this.accounts.list(userId)).map((account) =>
          account.summary?.game === 'steam'
            ? {
                ...account,
                summary: { ...account.summary, games: account.summary.games.slice(0, STEAM_TOP) },
              }
            : account,
        ),
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
          realm: {
            type: 'string',
            description: 'WoW realm slug: "Гордунни" → gordunni, "Howling Fjord" → howling-fjord',
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
}
