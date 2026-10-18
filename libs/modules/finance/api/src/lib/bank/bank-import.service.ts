import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { AiService, DB, Database, UsersService } from '@pd/api-core';
import {
  addDays,
  BankSyncResult,
  parseLocalDate,
  toLocalDate,
  TransactionKind,
  zonedDateTime,
} from '@pd/contracts';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { financeMessages } from '../finance.messages';
import { transactions } from '../finance.schema';
import { TransactionsService } from '../transactions/transactions.service';
import {
  BankOperation,
  counterpartyKey,
  isOwnTransfer,
  MatchCandidate,
  matchOf,
  normalizeIban,
  operationsOf,
} from './bank-operations';
import { BankAccountRow, bankAccounts, BankConnectionRow } from './bank.schema';
import { OWN_ACCOUNT, parsePkoStatement, Statement } from './pko-statement';
import { EnableBankingClient } from './enable-banking.client';

/** A first import asks for this much history; the bank gives what it keeps (often 90 days). */
const HISTORY_DAYS = 730;
/** A bank that refuses so long a history is asked for this much. */
const SHORT_HISTORY_DAYS = 89;
/** Each import starts this many days before the last booked one: a late booking is not lost. */
const OVERLAP_DAYS = 5;
/** Operations booked this recently are news for the automations; the older are history. */
const RECENT_DAYS = 2;
/** The new counterparties the AI is asked about at once. */
const AI_BATCH = 60;

const AI_INSTRUCTION =
  'You sort bank operations into the categories of a personal budget. You get a JSON object: ' +
  '`categories` — the categories the user has, by kind; `operations` — the counterparties ' +
  'with the kind and the payment title. Answer with JSON only: an object from each ' +
  'counterparty to one category of its kind exactly as written in `categories`, or null when ' +
  'none fits. Never make up a category.';

/**
 * The import of a bank's operations into Finance: the booked operations of the enabled
 * accounts become transactions — a transfer between the user's own accounts is left out, a
 * transaction typed by hand that is the same operation is tied to it instead of doubled. The
 * category follows the counterparty: the one its latest transaction had (so a corrected
 * category is the rule next time), else the AI's choice among the user's own, else
 * "Uncategorized".
 */
@Injectable()
export class BankImportService {
  private readonly logger = new Logger(BankImportService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly transactions: TransactionsService,
    private readonly ai: AiService,
    private readonly users: UsersService,
  ) {}

  async importConnection(
    connection: BankConnectionRow,
    client: EnableBankingClient,
  ): Promise<BankSyncResult> {
    const accounts = await this.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.connectionId, connection.id));
    // Every account of the user's banks, enabled or not: a transfer to any of them is their own.
    const own = await this.db
      .select({ iban: bankAccounts.iban })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, connection.userId));
    const ownIbans = new Set(own.flatMap((row) => normalizeIban(row.iban) ?? []));
    const today = await this.today(connection.userId);
    const total: BankSyncResult = { added: 0, matched: 0 };
    for (const account of accounts.filter((item) => item.enabled)) {
      const result = await this.importAccount(account, client, ownIbans, today);
      total.added += result.added;
      total.matched += result.matched;
    }
    return total;
  }

  private async importAccount(
    account: BankAccountRow,
    client: EnableBankingClient,
    ownIbans: Set<string>,
    today: string,
  ): Promise<BankSyncResult> {
    const from = account.lastBookedOn
      ? shift(account.lastBookedOn, -OVERLAP_DAYS)
      : shift(today, -HISTORY_DAYS);
    const fetched = await client
      .transactions(account.uid, from)
      .catch((error: unknown) =>
        account.lastBookedOn
          ? Promise.reject(error)
          : client.transactions(account.uid, shift(today, -SHORT_HISTORY_DAYS)),
      );
    const operations = operationsOf(fetched).filter((op) => !isOwnTransfer(op, ownIbans));
    const result = await this.save(account.userId, account.id, operations, today);
    const lastBooked = operations.reduce<string | null>(
      (latest, op) => (!latest || op.bookedOn > latest ? op.bookedOn : latest),
      account.lastBookedOn,
    );
    await this.db
      .update(bankAccounts)
      .set({ lastBookedOn: lastBooked, lastSyncedAt: new Date() })
      .where(eq(bankAccounts.id, account.id));
    return result;
  }

  /**
   * A history of an account exported from the bank (iPKO's CSV or XML): the same import, its
   * operations tied to no connected account. Its own transfers are told by the type, the
   * accounts of the connected banks, and the account the file is of.
   */
  async importStatement(userId: string, file: Buffer): Promise<BankSyncResult> {
    let statement: Statement;
    try {
      statement = parsePkoStatement(file);
    } catch (error) {
      throw new BadRequestException(String(error instanceof Error ? error.message : error));
    }
    const own = await this.db
      .select({ iban: bankAccounts.iban })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId));
    const ownIbans = new Set([
      OWN_ACCOUNT,
      ...own.flatMap((row) => normalizeIban(row.iban) ?? []),
      ...(statement.account ? [statement.account] : []),
    ]);
    const operations = statement.operations.filter((op) => !isOwnTransfer(op, ownIbans));
    return this.save(userId, null, operations, await this.today(userId));
  }

  private async save(
    userId: string,
    bankAccountId: string | null,
    operations: BankOperation[],
    today: string,
  ): Promise<BankSyncResult> {
    if (!operations.length) {
      return { added: 0, matched: 0 };
    }
    const known = new Set(
      (
        await this.db
          .select({ id: transactions.bankEntryId })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              inArray(
                transactions.bankEntryId,
                operations.map((op) => op.entryId),
              ),
            ),
          )
      ).map((row) => row.id),
    );
    const fresh = operations.filter((op) => !known.has(op.entryId));
    if (!fresh.length) {
      return { added: 0, matched: 0 };
    }
    // Typed by hand (or from a statement) within the days of the operations, not tied yet.
    const days = fresh.map((op) => op.bookedOn).sort();
    const candidates: MatchCandidate[] = await this.db
      .select({
        id: transactions.id,
        kind: transactions.kind,
        amount: transactions.amount,
        currency: transactions.currency,
        occurredOn: transactions.occurredOn,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.bankEntryId),
          isNull(transactions.projectId),
          gte(transactions.occurredOn, shift(days[0], -1)),
          lte(transactions.occurredOn, shift(days[days.length - 1], 1)),
        ),
      );
    const toAdd: BankOperation[] = [];
    let matched = 0;
    for (const op of fresh) {
      const match = matchOf(op, candidates);
      if (match) {
        candidates.splice(candidates.indexOf(match), 1);
        await this.transactions.linkToBank(userId, match.id, {
          bankAccountId,
          bankEntryId: op.entryId,
          counterparty: op.counterparty,
        });
        matched++;
      } else {
        toAdd.push(op);
      }
    }
    const categories = await this.categories(userId, toAdd);
    const added = await this.transactions.importFromBank(
      userId,
      toAdd.map((op) => ({
        kind: op.kind,
        amount: op.amount,
        currency: op.currency,
        category: categories.get(op) as string,
        note: [op.counterparty, op.note].filter(Boolean).join(' — ').slice(0, 500) || null,
        occurredOn: op.bookedOn,
        projectId: null,
        bankAccountId,
        bankEntryId: op.entryId,
        counterparty: op.counterparty,
      })),
      shift(today, -RECENT_DAYS),
    );
    return { added, matched };
  }

  /** The category of every operation: by its counterparty's history, the AI, or none. */
  private async categories(
    userId: string,
    operations: BankOperation[],
  ): Promise<Map<BankOperation, string>> {
    const result = new Map<BankOperation, string>();
    if (!operations.length) {
      return result;
    }
    const history = await this.db
      .select({
        kind: transactions.kind,
        category: transactions.category,
        counterparty: transactions.counterparty,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNotNull(transactions.counterparty)))
      .orderBy(desc(transactions.createdAt))
      .limit(5000);
    // The latest first: a category corrected by hand wins over the older ones.
    const known = new Map<string, string>();
    for (const row of history) {
      const key = `${row.kind}|${counterpartyKey(row.counterparty)}`;
      if (!known.has(key)) {
        known.set(key, row.category);
      }
    }
    const unknown: BankOperation[] = [];
    for (const op of operations) {
      const category = known.get(`${op.kind}|${counterpartyKey(op.counterparty)}`);
      if (category && op.counterparty) {
        result.set(op, category);
      } else {
        unknown.push(op);
      }
    }
    const guessed = await this.guess(userId, unknown);
    const user = await this.users.findById(userId);
    const fallback = financeMessages(user?.locale ?? 'en').uncategorized;
    for (const op of unknown) {
      result.set(op, guessed.get(`${op.kind}|${counterpartyKey(op.counterparty)}`) ?? fallback);
    }
    return result;
  }

  /**
   * The AI's category for each new counterparty, among the user's own categories only; empty
   * when the AI is not set up, is not allowed to see Finance, or fails — the import goes on.
   */
  private async guess(userId: string, operations: BankOperation[]): Promise<Map<string, string>> {
    const guessed = new Map<string, string>();
    const named = operations.filter((op) => counterpartyKey(op.counterparty));
    if (
      !named.length ||
      !(await this.ai.isConfigured(userId)) ||
      !(await this.ai.canSee(userId, 'finance'))
    ) {
      return guessed;
    }
    const own = await this.db
      .selectDistinct({ kind: transactions.kind, category: transactions.category })
      .from(transactions)
      .where(eq(transactions.userId, userId));
    const categories: Record<TransactionKind, string[]> = { income: [], expense: [] };
    own.forEach((row) => categories[row.kind].push(row.category));
    if (!categories.expense.length && !categories.income.length) {
      return guessed;
    }
    const distinct = new Map<string, BankOperation>();
    for (const op of named) {
      distinct.set(`${op.kind}|${counterpartyKey(op.counterparty)}`, op);
    }
    const batch = [...distinct.entries()].slice(0, AI_BATCH);
    try {
      const reply = await this.ai.complete(
        userId,
        AI_INSTRUCTION,
        JSON.stringify({
          categories,
          operations: batch.map(([, op]) => ({
            counterparty: op.counterparty,
            kind: op.kind,
            title: op.note,
          })),
        }),
        'finance',
      );
      const answer = parseJsonObject(reply);
      for (const [key, op] of batch) {
        const category = answer[op.counterparty as string];
        if (typeof category === 'string' && categories[op.kind].includes(category)) {
          guessed.set(key, category);
        }
      }
    } catch (error) {
      this.logger.warn(`The AI did not sort the bank's operations: ${String(error)}`);
    }
    return guessed;
  }

  private async today(userId: string): Promise<string> {
    const timeZone = this.users.timeZoneOf(await this.users.findById(userId));
    return zonedDateTime(new Date(), timeZone).date;
  }
}

/** The first JSON object of an answer (a model may wrap it in a code block). */
function parseJsonObject(reply: string): Record<string, unknown> {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(reply.slice(start, end + 1));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function shift(day: string, by: number): string {
  return toLocalDate(addDays(parseLocalDate(day), by));
}
