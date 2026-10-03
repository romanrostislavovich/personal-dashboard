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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthUser, CurrentUser, ZodValidationPipe } from '@pd/api-core';
import {
  Budget,
  BudgetQuery,
  budgetQuerySchema,
  Budgets,
  budgetsSchema,
  FinanceReportQuery,
  financeReportQuerySchema,
  FinanceSettingsInput,
  financeSettingsSchema,
  GoalContribution,
  goalContributionSchema,
  savingsGoalInputSchema,
  SubscriptionDismiss,
  subscriptionDismissSchema,
  recurringPaymentInputSchema,
  TransactionInput,
  transactionInputSchema,
  TransactionQuery,
  transactionQuerySchema,
} from '@pd/contracts';
import { BudgetsService } from './budgets/budgets.service';
import { GoalsService } from './goals/goals.service';
import { SubscriptionsService } from './recurring/subscriptions.service';
import { FinanceReportsService } from './reports/finance-reports.service';
import { ReceiptsService } from './receipts/receipts.service';
import { FinanceSettingsService } from './currency/finance-settings.service';
import {
  RecurringPaymentsService,
  ValidRecurringPaymentInput,
} from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

type ValidGoalInput = z.output<typeof savingsGoalInputSchema>;

@Controller('finance')
export class FinanceController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly recurring: RecurringPaymentsService,
    private readonly settings: FinanceSettingsService,
    private readonly budgetsService: BudgetsService,
    private readonly receipts: ReceiptsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly goals: GoalsService,
    private readonly reports: FinanceReportsService,
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

  /** The photo of a transaction's receipt (sent to the Telegram bot). */
  @Get('transactions/:id/receipt')
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, mimeType } = await this.receipts.photo(user.id, id);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.send(data);
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

  // --- Subscriptions ---

  /** What the subscriptions cost together and charges that look like ones. */
  @Get('subscriptions')
  subscriptionsSummary(@CurrentUser() user: AuthUser) {
    return this.subscriptions.summary(user.id);
  }

  /** "Not a subscription": the charge is not suggested again. */
  @Post('subscriptions/dismiss')
  @HttpCode(204)
  dismissSubscription(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(subscriptionDismissSchema)) body: SubscriptionDismiss,
  ) {
    return this.subscriptions.dismiss(user.id, body.key);
  }

  // --- Savings goals ---

  @Get('goals')
  listGoals(@CurrentUser() user: AuthUser) {
    return this.goals.list(user.id);
  }

  @Post('goals')
  createGoal(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(savingsGoalInputSchema)) input: ValidGoalInput,
  ) {
    return this.goals.create(user.id, input);
  }

  @Put('goals/:id')
  updateGoal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(savingsGoalInputSchema)) input: ValidGoalInput,
  ) {
    return this.goals.update(user.id, id, input);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  removeGoal(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.remove(user.id, id);
  }

  @Get('goals/:id/contributions')
  goalContributions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.goals.contributions(user.id, id);
  }

  @Post('goals/:id/contributions')
  contribute(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(goalContributionSchema)) input: GoalContribution,
  ) {
    return this.goals.contribute(user.id, id, input);
  }

  @Delete('goals/:id/contributions/:contributionId')
  @HttpCode(204)
  removeContribution(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contributionId', ParseUUIDPipe) contributionId: string,
  ) {
    return this.goals.removeContribution(user.id, id, contributionId);
  }

  // --- The AI's review of a month ---

  /** The kept review of a month; `report: null` — not written yet. */
  @Get('reports')
  async report(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(financeReportQuerySchema)) query: FinanceReportQuery,
  ) {
    return { report: await this.reports.get(user.id, query.month) };
  }

  /** Writes (or writes again) the review of a month. */
  @Post('reports')
  async writeReport(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(financeReportQuerySchema)) body: FinanceReportQuery,
  ) {
    return { report: await this.reports.generate(user.id, body.month) };
  }
}
