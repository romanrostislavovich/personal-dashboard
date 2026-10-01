import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import {
  DotaMatchesQuery,
  dotaMatchesQuerySchema,
  DotaOverview,
  DotaOverviewQuery,
  dotaOverviewQuerySchema,
  DotaMatchesPage,
  GameAccountInput,
  gameAccountInputSchema,
  GamesSettings,
  OpenDotaKeyInput,
  openDotaKeyInputSchema,
  WowCredentialsInput,
  wowCredentialsInputSchema,
} from '@pd/contracts';
import { DotaOverviewService } from './dota/dota-overview.service';
import { OpenDotaKeyService } from './dota/opendota-key.service';
import { GameAccountsService } from './game-accounts.service';
import { WowService } from './wow/wow.service';
import { GAMES_ACTIONS } from './games.server-actions';

@Controller('games')
export class GamesController {
  constructor(
    private readonly actions: ServerActions,
    private readonly accounts: GameAccountsService,
    private readonly wow: WowService,
    private readonly dota: DotaOverviewService,
    private readonly openDotaKeys: OpenDotaKeyService,
  ) {}

  @Get('accounts')
  list(@CurrentUser() user: AuthUser) {
    return this.accounts.list(user.id);
  }

  @Post('accounts')
  @HttpCode(204)
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(gameAccountInputSchema)) input: GameAccountInput,
  ) {
    return this.actions.run(user.id, GAMES_ACTIONS.addAccount, input);
  }

  @Post('accounts/:id/sync')
  @HttpCode(204)
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.run(user.id, GAMES_ACTIONS.syncAccount, { id });
  }

  /** "Refresh all": every game account now, without waiting for the half-hourly sync. */
  @Post('sync')
  @HttpCode(204)
  syncAll(@CurrentUser() user: AuthUser) {
    return this.actions.run(user.id, GAMES_ACTIONS.syncAll);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(user.id, id);
  }

  /** The Dota page: one account (`?accountId=`) or all Dota accounts together. */
  @Get('dota/overview')
  dotaOverview(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(dotaOverviewQuerySchema)) query: DotaOverviewQuery,
  ): Promise<DotaOverview> {
    return this.dota.overview(user.id, query.accountId);
  }

  @Get('dota/matches')
  dotaMatches(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(dotaMatchesQuerySchema)) query: DotaMatchesQuery,
  ): Promise<DotaMatchesPage> {
    return this.dota.matches(user.id, query);
  }

  @Get('settings')
  async settings(@CurrentUser() user: AuthUser): Promise<GamesSettings> {
    return {
      wowCredentials: await this.wow.hasCredentials(user.id),
      openDotaKeyAccounts: await this.openDotaKeys.accountsWithKey(
        user.id,
        await this.accounts.idsOf(user.id, 'dota2'),
      ),
    };
  }

  @Put('wow/credentials')
  @HttpCode(204)
  saveWowCredentials(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wowCredentialsInputSchema)) input: WowCredentialsInput,
  ) {
    return this.wow.saveCredentials(user.id, input);
  }

  /** Checks the OpenDota API key of a Dota account, saves it and refreshes the account with it. */
  @Put('accounts/:id/opendota-key')
  @HttpCode(204)
  saveOpenDotaKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Body(new ZodValidationPipe(openDotaKeyInputSchema)) input: OpenDotaKeyInput,
  ) {
    return this.actions.run(user.id, GAMES_ACTIONS.saveOpenDotaKey, { accountId, ...input });
  }

  @Delete('accounts/:id/opendota-key')
  @HttpCode(204)
  removeOpenDotaKey(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) accountId: string) {
    return this.openDotaKeys.remove(user.id, accountId);
  }
}
