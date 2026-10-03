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
  Budget,
  BudgetQuery,
  budgetQuerySchema,
  Budgets,
  budgetsSchema,
  FinanceSettingsInput,
  financeSettingsSchema,
  recurringPaymentInputSchema,
  TransactionInput,
  transactionInputSchema,
  TransactionQuery,
  transactionQuerySchema,
} from '@pd/contracts';
import { BudgetsService } from './budgets/budgets.service';
import { FinanceSettingsService } from './currency/finance-settings.service';
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
    private readonly settings: FinanceSettingsService,
    private readonly budgetsService: BudgetsService,
  ) {}

  // --- Settings: the main currency ---

  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.settings.get(user.id);
  }

  @Put('settings')
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(financeSettingsSchema)) input: FinanceSettingsInput,
  ) {
    return this.settings.save(user.id, input);
  }

  // --- Transactions ---

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

  @Get('cash-flow')
  cashFlow(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactionQuerySchema)) query: TransactionQuery,
  ) {
    return this.transactions.cashFlow(user.id, query);
  }

  /** The same months, everything converted into the main currency. */
  @Get('cash-flow/main')
  cashFlowInMain(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactionQuerySchema)) query: TransactionQuery,
  ) {
    return this.transactions.cashFlowInMain(user.id, query);
  }

  /** The budgets with what was spent in a month. */
  @Get('budgets')
  budgets(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(budgetQuerySchema)) query: BudgetQuery,
  ): Promise<Budget[]> {
    return this.budgetsService.list(user.id, query.month);
  }

  /** The whole set of budgets at once. */
  @Put('budgets')
  @HttpCode(204)
  saveBudgets(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(budgetsSchema)) body: Budgets,
  ): Promise<void> {
    return this.budgetsService.save(user.id, body.budgets);
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

  // --- Recurring payments ---

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
