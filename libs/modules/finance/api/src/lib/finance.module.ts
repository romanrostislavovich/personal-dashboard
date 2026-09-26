import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { RecurringPaymentsJob } from './recurring/recurring-payments.job';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

/**
 * Финансы: личные и проектные доходы/расходы + регулярные платежи.
 * API: `/api/finance/*`.
 */
@Module({
  controllers: [FinanceController],
  providers: [TransactionsService, RecurringPaymentsService, RecurringPaymentsJob],
})
export class FinanceModule {}
