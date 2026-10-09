import { FinanceIntegrations } from './finance.integrations';
import { FinanceDemo } from './finance.demo';
import { Module } from '@nestjs/common';
import { FinanceAutomations } from './finance.automations';
import { FinanceLife } from './finance.life';
import { FinanceLinks } from './finance.links';
import { FinanceExport } from './finance.export';
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
import { BudgetsService } from './budgets/budgets.service';
import { ReceiptsService } from './receipts/receipts.service';
import { SubscriptionsService } from './recurring/subscriptions.service';
import { GoalsService } from './goals/goals.service';
import { FinanceReportsService } from './reports/finance-reports.service';
import { WishlistController } from './wishlist/wishlist.controller';
import { WishlistJob } from './wishlist/wishlist.job';
import { WishlistService } from './wishlist/wishlist.service';

/**
 * Finance: personal and project income/expenses, recurring payments and subscriptions, budgets,
 * savings goals, a wishlist with price watch, the AI's monthly review and automatic cost import
 * from services (Hetzner, DeepSeek). API: `/api/finance/*`.
 */
@Module({
  controllers: [FinanceController, CostSourcesController, WishlistController],
  providers: [
    FinanceAutomations,
    FinanceDemo,
    FinanceIntegrations,
    FinanceLife,
    FinanceLinks,
    FinanceExport,
    FinanceSearch,
    TransactionsService,
    BudgetsService,
    ReceiptsService,
    ExchangeRatesService,
    FinanceSettingsService,
    RecurringPaymentsService,
    RecurringPaymentsJob,
    SubscriptionsService,
    GoalsService,
    WishlistService,
    WishlistJob,
    FinanceReportsService,
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
