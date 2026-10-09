import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, IntegrationsService } from '@pd/api-core';
import { eq } from 'drizzle-orm';
import { costSources } from './finance.schema';

/** The costs are imported once a day: three days without an import is too long. */
const STALE_HOURS = 72;
const NAMES = { hetzner: 'Hetzner Cloud', deepseek: 'DeepSeek' } as const;

/** The connections of Finance in the list of integrations: the sources of costs. */
@Injectable()
export class FinanceIntegrations implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly integrations: IntegrationsService,
  ) {}

  onModuleInit(): void {
    this.integrations.register({
      id: 'finance.cost-source',
      module: 'finance',
      staleHours: STALE_HOURS,
      reports: async (userId) => {
        const sources = await this.db
          .select()
          .from(costSources)
          .where(eq(costSources.userId, userId));
        return sources.map((source) => ({
          key: source.id,
          name: NAMES[source.provider],
          detail: source.name,
          lastSyncedAt: source.lastSyncedAt,
          error: source.lastError,
        }));
      },
    });
  }
}
