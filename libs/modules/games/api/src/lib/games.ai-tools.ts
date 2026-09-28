import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiService, findById, idParameters, NO_PARAMETERS, ServerActions } from '@pd/api-core';
import { GAMES, gameAccountInputSchema, WOW_REGIONS } from '@pd/contracts';
import { DotaOverviewService } from './dota/dota-overview.service';
import { GameAccountsService } from './game-accounts.service';
import { GAMES_ACTIONS } from './games.server-actions';

/** AI access to games: Dota 2 and WoW; adding, refreshing and removing accounts (assistant). */
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
        'WoW: character, ilvl, achievement points and recent achievements.',
      parameters: NO_PARAMETERS,
      handler: (userId) => this.accounts.list(userId),
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
      name: 'games_add_account',
      module: 'games',
      writes: true,
      description:
        'Adds a game account and loads its data. Dota 2 needs steamId; WoW needs region, realm ' +
        'and character name (WoW works only after Battle.net keys are set in the dashboard).',
      parameters: {
        type: 'object',
        properties: {
          game: { type: 'string', enum: [...GAMES] },
          steamId: {
            type: 'string',
            description: 'Dota 2: Steam ID32/ID64 or an OpenDota/Dotabuff/Steam profile link',
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
