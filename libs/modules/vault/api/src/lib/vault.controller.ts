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
import {AuthUser, CurrentUser, ZodValidationPipe} from '@pd/api-core';
import {
  VaultItemInput,
  vaultItemInputSchema,
  VaultKeys,
  VaultKeysChange,
  vaultKeysChangeSchema,
  vaultKeysSchema,
} from '@pd/contracts';
import {VaultService} from './vault.service';

/** The password vault: ciphertext in, ciphertext out (see vault-crypto.ts). */
@Controller('vault')
export class VaultController {
  constructor(private readonly vault: VaultService) {}

  /** `{ keys: null }` — not set up yet. */
  @Get('keys')
  async keys(@CurrentUser() user: AuthUser) {
    return {keys: await this.vault.keys(user.id)};
  }

  @Post('keys')
  @HttpCode(204)
  createKeys(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(vaultKeysSchema)) keys: VaultKeys,
  ) {
    return this.vault.createKeys(user.id, keys);
  }

  @Put('keys')
  @HttpCode(204)
  changeKeys(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(vaultKeysChangeSchema)) change: VaultKeysChange,
  ) {
    return this.vault.changeKeys(user.id, change);
  }

  @Get('items')
  items(@CurrentUser() user: AuthUser) {
    return this.vault.items(user.id);
  }

  @Post('items')
  addItem(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(vaultItemInputSchema)) input: VaultItemInput,
  ) {
    return this.vault.addItem(user.id, input);
  }

  @Put('items/:id')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vaultItemInputSchema)) input: VaultItemInput,
  ) {
    return this.vault.updateItem(user.id, id, input);
  }

  @Delete('items/:id')
  @HttpCode(204)
  removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vault.removeItem(user.id, id);
  }
}
