import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, gte, lt } from 'drizzle-orm';
import { DB, Database } from '../database/database.module';
import { SignInRow, signIns } from './security.schema';

/**
 * How an attempt ended. An attempt refused for too many before it (429) is not journaled:
 * whoever hammers the sign-in would fill the table.
 */
export type SignInOutcome = 'ok' | 'wrong-password' | 'wrong-code';

/** Attempts are kept this long: enough to see a pattern, not a history for ever. */
const KEEP_DAYS = 90;
/** A request may send anything as its User-Agent: only this much of it is kept. */
const MAX_TEXT = 300;

/** The journal of sign-ins: who tried to get in, from where, and how it ended. */
@Injectable()
export class SignInLog {
  private readonly logger = new Logger(SignInLog.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Never fails a sign-in: a journal that cannot be written is only logged. */
  async record(attempt: {
    userId: string | null;
    email: string;
    outcome: SignInOutcome;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    try {
      await this.db.insert(signIns).values({
        ...attempt,
        email: attempt.email.slice(0, MAX_TEXT),
        userAgent: attempt.userAgent?.slice(0, MAX_TEXT) ?? null,
      });
    } catch (error) {
      this.logger.warn(`A sign-in was not journaled: ${String(error)}`);
    }
  }

  since(from: Date): Promise<SignInRow[]> {
    return this.db.select().from(signIns).where(gte(signIns.at, from)).orderBy(desc(signIns.at));
  }

  async prune(): Promise<void> {
    await this.db
      .delete(signIns)
      .where(lt(signIns.at, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
  }
}
