import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, ProjectsService, SecretsService } from '@pd/api-core';
import { CostProvider, CostSource, CostSourceInput, todayIn } from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { CostSourceRow, costSources, transactions } from '../finance.schema';
import {
  CostMeasurement,
  CostProviderAdapter,
  CostProviderAuthError,
  roundMoney,
} from './cost-provider';
import { DeepseekCostProvider } from './providers/deepseek.provider';
import { HetznerCostProvider } from './providers/hetzner.provider';

@Injectable()
export class CostSourcesService {
  private readonly logger = new Logger(CostSourcesService.name);
  private readonly adapters: Record<CostProvider, CostProviderAdapter>;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly secrets: SecretsService,
    private readonly projects: ProjectsService,
    hetzner: HetznerCostProvider,
    deepseek: DeepseekCostProvider,
  ) {
    this.adapters = { hetzner, deepseek };
  }

  async list(userId: string): Promise<CostSource[]> {
    const period = this.currentPeriod();
    const rows = await this.db
      .select({ source: costSources, amount: transactions.amount, currency: transactions.currency })
      .from(costSources)
      .leftJoin(
        transactions,
        and(eq(transactions.costSourceId, costSources.id), eq(transactions.costPeriod, period)),
      )
      .where(eq(costSources.userId, userId))
      .orderBy(asc(costSources.createdAt));

    return rows.map(({ source, amount, currency }) => ({
      id: source.id,
      provider: source.provider,
      name: source.name,
      category: source.category,
      projectId: source.projectId,
      lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      lastError: source.lastError,
      currentMonth: amount !== null && currency ? { amount, currency } : null,
    }));
  }

  /** Connects a source: checks the token, saves it encrypted and syncs right away. */
  async create(userId: string, input: CostSourceInput): Promise<void> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    try {
      await this.adapters[input.provider].verify(input.apiToken);
    } catch (error) {
      if (error instanceof CostProviderAuthError) {
        throw new BadRequestException('Invalid API token');
      }
      throw error;
    }

    const { apiToken, ...fields } = input;
    const [source] = await this.db
      .insert(costSources)
      .values({ userId, ...fields })
      .returning();
    await this.secrets.set(userId, secretKey(source.id), apiToken);
    await this.sync(source);
  }

  /** Disconnects a source. Already imported transactions stay in the history. */
  async remove(userId: string, id: string): Promise<void> {
    const [source] = await this.db
      .delete(costSources)
      .where(and(eq(costSources.id, id), eq(costSources.userId, userId)))
      .returning();
    if (source) {
      await this.secrets.delete(userId, secretKey(id));
    }
  }

  async syncOne(userId: string, id: string): Promise<void> {
    const [source] = await this.db
      .select()
      .from(costSources)
      .where(and(eq(costSources.id, id), eq(costSources.userId, userId)));
    if (!source) {
      throw new NotFoundException();
    }
    await this.sync(source);
  }

  /** Syncs all sources of all users (daily job). */
  async syncAll(): Promise<void> {
    for (const source of await this.db.select().from(costSources)) {
      await this.sync(source);
    }
  }

  /** An error in one source is written to lastError and does not affect the others. */
  private async sync(source: CostSourceRow): Promise<void> {
    try {
      const token = await this.secrets.get(source.userId, secretKey(source.id));
      if (!token) {
        throw new Error('API token is missing');
      }
      const measurement = await this.adapters[source.provider].measure(token, source.state);
      await this.applyMeasurement(source, measurement);
    } catch (error) {
      this.logger.warn(`Cost source ${source.name} failed: ${error}`);
      await this.db
        .update(costSources)
        .set({ lastError: error instanceof Error ? error.message : String(error) })
        .where(eq(costSources.id, source.id));
    }
  }

  /**
   * One expense transaction per source and month: for `monthTotal` the amount is replaced,
   * for `increment` it is increased. All in one transaction so nothing is counted twice.
   */
  private async applyMeasurement(source: CostSourceRow, measurement: CostMeasurement) {
    const period = this.currentPeriod();
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.costSourceId, source.id), eq(transactions.costPeriod, period)));

      const amount =
        measurement.kind === 'monthTotal'
          ? measurement.amount
          : roundMoney((existing?.amount ?? 0) + measurement.amount);

      if (existing) {
        await tx
          .update(transactions)
          .set({ amount, currency: measurement.currency })
          .where(eq(transactions.id, existing.id));
      } else if (amount > 0) {
        await tx.insert(transactions).values({
          userId: source.userId,
          projectId: source.projectId,
          costSourceId: source.id,
          costPeriod: period,
          kind: 'expense',
          amount,
          currency: measurement.currency,
          category: source.category,
          note: source.name,
          occurredOn: `${period}-01`,
        });
      }

      await tx
        .update(costSources)
        .set({
          state: measurement.kind === 'increment' ? measurement.state : source.state,
          lastSyncedAt: new Date(),
          lastError: null,
        })
        .where(eq(costSources.id, source.id));
    });
  }

  /** Current month `YYYY-MM` in the app time zone. */
  private currentPeriod(): string {
    const { year, month } = todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
    return `${year}-${String(month).padStart(2, '0')}`;
  }
}

function secretKey(sourceId: string): string {
  return `finance.cost-source.${sourceId}`;
}
