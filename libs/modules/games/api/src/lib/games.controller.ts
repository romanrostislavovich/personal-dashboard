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
} from '@nestjs/common';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  GameAccountInput,
  gameAccountInputSchema,
  GamesSettings,
  WowCredentialsInput,
  wowCredentialsInputSchema,
} from '@pd/contracts';
import { GameAccountsService } from './game-accounts.service';
import { WowService } from './wow/wow.service';

@Controller('games')
export class GamesController {
  constructor(
    private readonly accounts: GameAccountsService,
    private readonly wow: WowService,
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
    return this.accounts.add(user.id, input);
  }

  @Post('accounts/:id/sync')
  @HttpCode(204)
  sync(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.syncOne(user.id, id);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.remove(user.id, id);
  }

  @Get('settings')
  async settings(@CurrentUser() user: AuthUser): Promise<GamesSettings> {
    return { wowCredentials: await this.wow.hasCredentials(user.id) };
  }

  @Put('wow/credentials')
  @HttpCode(204)
  saveWowCredentials(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wowCredentialsInputSchema)) input: WowCredentialsInput,
  ) {
    return this.wow.saveCredentials(user.id, input);
  }
}
