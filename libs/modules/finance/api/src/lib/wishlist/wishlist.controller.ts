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
import { AuthUser, CurrentUser, ServerActions, ZodValidationPipe } from '@pd/api-core';
import { Wish, WishBought, wishBoughtSchema, wishInputSchema } from '@pd/contracts';
import { z } from 'zod';
import { FINANCE_ACTIONS } from '../finance.server-actions';
import { WishlistService } from './wishlist.service';

type ValidWishInput = z.output<typeof wishInputSchema>;

/** Things to buy one day, with their prices watched: `/api/finance/wishlist`. */
@Controller('finance/wishlist')
export class WishlistController {
  constructor(
    private readonly wishlist: WishlistService,
    private readonly actions: ServerActions,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.wishlist.list(user.id);
  }

  /** Reads the page for the name, the picture and the first price. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wishInputSchema)) input: ValidWishInput,
  ) {
    return this.actions.run<Wish>(user.id, FINANCE_ACTIONS.addWish, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(wishInputSchema)) input: ValidWishInput,
  ) {
    return this.wishlist.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wishlist.remove(user.id, id);
  }

  @Get(':id/prices')
  prices(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.wishlist.history(user.id, id);
  }

  /** "Check now": reads the price again without waiting for the morning. */
  @Post(':id/check')
  @HttpCode(200)
  check(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.actions.run<Wish>(user.id, FINANCE_ACTIONS.checkWish, { id });
  }

  @Put(':id/bought')
  setBought(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(wishBoughtSchema)) body: WishBought,
  ) {
    return this.wishlist.setBought(user.id, id, body.bought, body.record);
  }
}
