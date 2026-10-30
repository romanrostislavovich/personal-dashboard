import {Inject, Injectable} from '@nestjs/common';
import {AiUsageTotals, zonedDateTime} from '@pd/contracts';
import {and, eq, gte, sql} from 'drizzle-orm';
import {DB, Database} from '../database/database.module';
import {UsersService} from '../users/users.service';
import {AiConnectionRow, aiConnections, aiUsage} from './ai.schema';
import {
  ChatConnection,
  ChatMessage,
  chatCompletionWithUsage,
  TokenUsage,
  ToolDefinition,
} from './openai-compatible.client';

type AssistantMessage = Extract<ChatMessage, {role: 'assistant'}>;

/** The monthly limit of the connection is spent: no more requests through it this month. */
export class AiLimitError extends Error {
  constructor(readonly connectionName: string) {
    super(
      `The monthly limit of the AI connection "${connectionName}" is reached`,
    );
  }
}

/** The prices of a connection, USD a million tokens. */
type Prices = Pick<AiConnectionRow, 'priceInput' | 'priceOutput'>;

/** The cost of the tokens; null — the prices are not set. */
export function costOf(
  usage: Omit<AiUsageTotals, 'cost' | 'requests'>,
  prices: Prices,
) {
  if (prices.priceInput === null || prices.priceOutput === null) {
    return null;
  }
  return (
    (usage.promptTokens * prices.priceInput +
      usage.completionTokens * prices.priceOutput) /
    1_000_000
  );
}

/**
 * What the AI costs: every request through a saved connection is counted (the tokens the
 * provider reports, per connection, model and day), and a connection with a monthly limit
 * refuses requests once it is spent.
 */
@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
  ) {}

  /** A request to the model, checked against the limit and counted. */
  async complete(
    userId: string,
    connection: ChatConnection,
    messages: ChatMessage[],
    tools: ToolDefinition[] = [],
  ): Promise<AssistantMessage> {
    await this.checkLimit(userId, connection);
    const {message, usage} = await chatCompletionWithUsage(
      connection,
      messages,
      tools,
    );
    if (usage) {
      await this.record(userId, connection, usage);
    }
    return message;
  }

  /** Throws AiLimitError when the connection's limit of this month is spent. */
  async checkLimit(userId: string, connection: ChatConnection): Promise<void> {
    if (!connection.id) {
      return;
    }
    const [row] = await this.db
      .select()
      .from(aiConnections)
      .where(
        and(
          eq(aiConnections.id, connection.id),
          eq(aiConnections.userId, userId),
        ),
      );
    if (!row?.monthlyLimit) {
      return;
    }
    const spent = (
      await this.totals(userId, await this.monthStart(userId))
    ).get(row.id);
    if (spent && (costOf(spent, row) ?? 0) >= row.monthlyLimit) {
      throw new AiLimitError(row.name);
    }
  }

  async record(
    userId: string,
    connection: ChatConnection,
    usage: TokenUsage,
  ): Promise<void> {
    if (!connection.id) {
      return;
    }
    const day = zonedDateTime(new Date(), await this.timeZone(userId)).date;
    await this.db
      .insert(aiUsage)
      .values({
        userId,
        connectionId: connection.id,
        day,
        model: connection.model,
        requests: 1,
        ...usage,
      })
      .onConflictDoUpdate({
        target: [aiUsage.connectionId, aiUsage.day, aiUsage.model],
        set: {
          promptTokens: sql`${aiUsage.promptTokens} + ${usage.promptTokens}`,
          completionTokens: sql`${aiUsage.completionTokens} + ${usage.completionTokens}`,
          cachedTokens: sql`${aiUsage.cachedTokens} + ${usage.cachedTokens}`,
          requests: sql`${aiUsage.requests} + 1`,
        },
      });
  }

  /** Today's and this month's tokens of each connection of the user, with their cost. */
  async summary(
    userId: string,
    rows: AiConnectionRow[],
  ): Promise<Map<string, {today: AiUsageTotals; month: AiUsageTotals}>> {
    const today = zonedDateTime(new Date(), await this.timeZone(userId)).date;
    const month = await this.totals(userId, `${today.slice(0, 7)}-01`);
    const day = await this.totals(userId, today);
    return new Map(
      rows.map(row => [
        row.id,
        {
          today: withCost(day.get(row.id), row),
          month: withCost(month.get(row.id), row),
        },
      ]),
    );
  }

  /** The tokens of each connection since the day. */
  private async totals(userId: string, since: string) {
    const rows = await this.db
      .select({
        connectionId: aiUsage.connectionId,
        requests: sql<number>`sum(${aiUsage.requests})::int`,
        promptTokens: sql<number>`sum(${aiUsage.promptTokens})::bigint`.mapWith(
          Number,
        ),
        completionTokens:
          sql<number>`sum(${aiUsage.completionTokens})::bigint`.mapWith(Number),
        cachedTokens: sql<number>`sum(${aiUsage.cachedTokens})::bigint`.mapWith(
          Number,
        ),
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), gte(aiUsage.day, since)))
      .groupBy(aiUsage.connectionId);
    return new Map(
      rows.map(({connectionId, ...totals}) => [connectionId, totals]),
    );
  }

  private async monthStart(userId: string): Promise<string> {
    return `${zonedDateTime(new Date(), await this.timeZone(userId)).date.slice(0, 7)}-01`;
  }

  private async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }
}

const NONE = {
  requests: 0,
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
};

function withCost(
  totals: Omit<AiUsageTotals, 'cost'> = NONE,
  prices: Prices,
): AiUsageTotals {
  return {...totals, cost: costOf(totals, prices)};
}
