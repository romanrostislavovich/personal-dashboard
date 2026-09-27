import { Module } from '@nestjs/common';
import { CostSourcesController } from './cost-sources/cost-sources.controller';
import { CostSourcesJob } from './cost-sources/cost-sources.job';
import { CostSourcesService } from './cost-sources/cost-sources.service';
import { DeepseekCostProvider } from './cost-sources/providers/deepseek.provider';
import { HetznerCostProvider } from './cost-sources/providers/hetzner.provider';
import { FinanceAchievements } from './finance.achievements';
import { FinanceAiTools } from './finance.ai-tools';
import { FinanceController } from './finance.controller';
import { RecurringPaymentsJob } from './recurring/recurring-payments.job';
import { RecurringPaymentsService } from './recurring/recurring-payments.service';
import { TransactionsService } from './transactions/transactions.service';

/**
 * Финансы: личные и проектные доходы/расходы, регулярные платежи
 * и автоимпорт затрат из сервисов (Hetzner, DeepSeek). API: `/api/finance/*`.
 */
@Module({
  controllers: [FinanceController, CostSourcesController],
  providers: [
    TransactionsService,
    RecurringPaymentsService,
    RecurringPaymentsJob,
    CostSourcesService,
    CostSourcesJob,
    // Провайдеры затрат: новый сервис = новый класс здесь + id в COST_PROVIDERS.
    HetznerCostProvider,
    DeepseekCostProvider,
    FinanceAchievements,
    FinanceAiTools,
  ],
})
export class FinanceModule {}
