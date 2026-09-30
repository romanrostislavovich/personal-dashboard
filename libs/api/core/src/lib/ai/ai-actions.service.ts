import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiAction, AiActionOutcome } from '@pd/contracts';
import { desc, eq, lt } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { aiActions } from './ai.schema';

/** The log shows this many recent actions… */
const LIST_LIMIT = 200;
/** …and keeps them this long. */
const KEEP_DAYS = 180;
/** Arguments can hold a whole bank statement: the log keeps the beginning. */
const MAX_ARGS_CHARS = 2_000;

/**
 * Every change the assistant made or tried to make (tools with `writes`): what, with which
 * arguments, how it ended. Deleted data itself is in the trash (see TrashService).
 */
@Injectable()
export class AiActionsService {
  private readonly logger = new Logger(AiActionsService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async record(
    userId: string,
    action: {
      tool: string;
      module: string;
      args: unknown;
      outcome: AiActionOutcome;
      error?: string;
    },
  ): Promise<void> {
    const args = JSON.stringify(action.args ?? {});
    try {
      await this.db.insert(aiActions).values({
        userId,
        tool: action.tool,
        module: action.module,
        args: args.length > MAX_ARGS_CHARS ? `${args.slice(0, MAX_ARGS_CHARS)}…` : args,
        outcome: action.outcome,
        error: action.error?.slice(0, 500) ?? null,
      });
    } catch (error) {
      // The log must never break the assistant itself.
      this.logger.warn(`Could not log an AI action: ${error}`);
    }
  }

  async list(userId: string): Promise<AiAction[]> {
    await this.db
      .delete(aiActions)
      .where(lt(aiActions.createdAt, new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000)));
    const rows = await this.db
      .select()
      .from(aiActions)
      .where(eq(aiActions.userId, userId))
      .orderBy(desc(aiActions.createdAt))
      .limit(LIST_LIMIT);
    return rows.map((row) => ({
      id: row.id,
      tool: row.tool,
      module: row.module,
      args: row.args,
      outcome: row.outcome as AiActionOutcome,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
