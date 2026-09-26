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
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  recurringPaymentInputSchema,
  TransactionInput,
  transactionInputSchema,
  TransactionQuery,
  transactionQuerySchema,
} from '@pd/contracts';
import {
  RecurringPaymentsService,
  ValidRecurringPaymentInput,
} from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly recurring: RecurringPaymentsService,
  ) {}

  // --- Операции ---

  @Get('transactions')
  listTransactions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactionQuerySchema)) query: TransactionQuery,
  ) {
    return this.transactions.list(user.id, query);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactionQuerySchema)) query: TransactionQuery,
  ) {
    return this.transactions.summary(user.id, query);
  }

  @Post('transactions')
  createTransaction(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(transactionInputSchema)) input: TransactionInput,
  ) {
    return this.transactions.create(user.id, input);
  }

  @Put('transactions/:id')
  updateTransaction(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transactionInputSchema)) input: TransactionInput,
  ) {
    return this.transactions.update(user.id, id, input);
  }

  @Delete('transactions/:id')
  @HttpCode(204)
  removeTransaction(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.remove(user.id, id);
  }

  // --- Регулярные платежи ---

  @Get('recurring-payments')
  listRecurring(@CurrentUser() user: AuthUser) {
    return this.recurring.list(user.id);
  }

  @Post('recurring-payments')
  createRecurring(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recurringPaymentInputSchema)) input: ValidRecurringPaymentInput,
  ) {
    return this.recurring.create(user.id, input);
  }

  @Put('recurring-payments/:id')
  updateRecurring(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recurringPaymentInputSchema)) input: ValidRecurringPaymentInput,
  ) {
    return this.recurring.update(user.id, id, input);
  }

  @Delete('recurring-payments/:id')
  @HttpCode(204)
  removeRecurring(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.recurring.remove(user.id, id);
  }
}
