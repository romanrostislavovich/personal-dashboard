import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  BankResortResult,
  BankState,
  BankSyncResult,
} from '@pd/contracts';
import { z } from 'zod';
import { BankImportService } from './bank-import.service';
import { BankService } from './bank.service';

/** A history of a year of operations is well under a megabyte. */
const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
const upload = FileInterceptor('file', { limits: { fileSize: STATEMENT_MAX_BYTES } });

/**
 * The bank directly (open banking): the owner's application, the user's connections — and a
 * history exported from iPKO (PKO BP), imported the same way without any of them.
 */
@Controller('finance/bank')
export class BankController {
  constructor(
    private readonly bank: BankService,
    private readonly importer: BankImportService,
  ) {}

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

  /** The bank's transactions still uncategorized: sorted again by history and the AI. */
  @Post('resort')
  resort(@CurrentUser() user: AuthUser): Promise<BankResortResult> {
    return this.importer.resort(user.id);
  }

  @Delete('connections/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bank.remove(user.id, id);
  }

  /** A history exported from iPKO (CSV or XML): its operations as transactions, once. */
  @Post('statement')
  @UseInterceptors(upload)
  importStatement(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<BankSyncResult> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file');
    }
    return this.importer.importStatement(user.id, file.buffer);
  }
}
