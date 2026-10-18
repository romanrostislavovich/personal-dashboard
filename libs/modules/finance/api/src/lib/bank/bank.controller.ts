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
  Redirect,
} from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ZodValidationPipe } from '@pd/api-core';
import {
  BankAccountUpdate,
  bankAccountUpdateSchema,
  BankAppInput,
  bankAppInputSchema,
  bankBanksQuerySchema,
  BankConnectInput,
  bankConnectInputSchema,
  BankOption,
  BankState,
  BankSyncResult,
} from '@pd/contracts';
import { z } from 'zod';
import { BankService } from './bank.service';

/** The bank directly (open banking): the owner's application, the user's connections. */
@Controller('finance/bank')
export class BankController {
  constructor(private readonly bank: BankService) {}

  @Get()
  state(@CurrentUser() user: AuthUser): Promise<BankState> {
    return this.bank.state(user.id);
  }

  /** The owner's application at Enable Banking: checked with it before it is kept. */
  @Put('app')
  @HttpCode(204)
  setApp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bankAppInputSchema)) input: BankAppInput,
  ): Promise<void> {
    return this.bank.setApp(user.id, input.appId, input.privateKey);
  }

  @Delete('app')
  @HttpCode(204)
  removeApp(@CurrentUser() user: AuthUser): Promise<void> {
    return this.bank.removeApp(user.id);
  }

  @Get('banks')
  banks(
    @Query(new ZodValidationPipe(bankBanksQuerySchema)) query: z.infer<typeof bankBanksQuerySchema>,
  ): Promise<BankOption[]> {
    return this.bank.banks(query.country);
  }

  /** The bank's sign-in page for the consent (or for confirming it again). */
  @Post('connect')
  connect(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bankConnectInputSchema)) input: BankConnectInput,
  ): Promise<{ url: string }> {
    return this.bank.connect(user.id, input);
  }

  /** The bank returns the browser here; the user is identified by `state`. */
  @Public()
  @Get('callback')
  @Redirect()
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    return { url: await this.bank.handleCallback(code, state, error) };
  }

  @Put('accounts/:id')
  @HttpCode(204)
  setAccount(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(bankAccountUpdateSchema)) input: BankAccountUpdate,
  ): Promise<void> {
    return this.bank.setAccount(user.id, id, input.enabled);
  }

  @Post('connections/:id/sync')
  sync(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BankSyncResult> {
    return this.bank.sync(user.id, id);
  }

  @Delete('connections/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bank.remove(user.id, id);
  }
}
