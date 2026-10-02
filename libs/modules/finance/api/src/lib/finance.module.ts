import { Module } from '@nestjs/common';
import { FinanceSearch } from './finance.search';
import { CostSourcesController } from './cost-sources/cost-sources.controller';
import { CostSourcesJob } from './cost-sources/cost-sources.job';
import { CostSourcesService } from './cost-sources/cost-sources.service';
import { DeepseekCostProvider } from './cost-sources/providers/deepseek.provider';
import { HetznerCostProvider } from './cost-sources/providers/hetzner.provider';
import { ExchangeRatesService } from './currency/exchange-rates.service';
import { FinanceSettingsService } from './currency/finance-settings.service';
import { FinanceAchievements } from './finance.achievements';
import { FinanceAiTools } from './finance.ai-tools';
import { FinanceDigest } from './finance.digest';
import { FinanceController } from './finance.controller';
import { FinanceServerActions } from './finance.server-actions';
import { RecurringPaymentsJob } from './recurring/recurring-payments.job';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

/**
 * Finance: personal and project income/expenses, recurring payments
 * and automatic cost import from services (Hetzner, DeepSeek). API: `/api/finance/*`.
 */
@Module({
  controllers: [FinanceController, CostSourcesController],
  providers: [
    FinanceSearch,
    TransactionsService,
    ExchangeRatesService,
    FinanceSettingsService,
    RecurringPaymentsService,
    RecurringPaymentsJob,
    CostSourcesService,
    CostSourcesJob,
    // Cost providers: a new service = a new class here + an id in COST_PROVIDERS.
    HetznerCostProvider,
    DeepseekCostProvider,
    FinanceAchievements,
    FinanceAiTools,
    FinanceDigest,
    FinanceServerActions,
  ],
})
export class FinanceModule {}
