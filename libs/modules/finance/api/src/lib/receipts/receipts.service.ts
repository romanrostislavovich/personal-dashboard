import { Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AiService, DB, Database, TelegramBotService, UserRow, UsersService } from '@pd/api-core';
import { zonedDateTime } from '@pd/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { FinanceSettingsService } from '../currency/finance-settings.service';
import { financeMessages } from '../finance.messages';
import { financeReceipts, transactions } from '../finance.schema';
import { TransactionsService } from '../transactions/transactions.service';
import { parseReceipt } from './receipt-parse';

const INSTRUCTION = (categories: string[]) => `You read a photo of a shop receipt (or a bill).
Answer with JSON only, no other text:
{"isReceipt": true or false, "shop": "the shop's name", "total": the final amount paid as a number,
 "currency": "ISO 4217 code (zł → PLN, ₽ → RUB, € → EUR, $ → USD; guess it from the country)",
 "date": "YYYY-MM-DD or null", "category": "the category of the purchase"}
For the category prefer one of the user's own: ${categories.length ? categories.join(', ') : '(none yet)'};
use a new short one only when none fits. Not a receipt at all — {"isReceipt": false}.`;

/** The categories the AI picks from: the user's own expense ones, the most used first. */
const CATEGORY_HINTS = 40;

/**
 * Receipts from Telegram: a photo the user marked as a receipt is read by the AI that sees
 * pictures and becomes an expense, with the photo kept next to it. The reply has a button to
 * take it back when the AI misread it.
 */
@Injectable()
export class ReceiptsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ai: AiService,
    private readonly telegram: TelegramBotService,
    private readonly transactions: TransactionsService,
    private readonly settings: FinanceSettingsService,
    private readonly users: UsersService,
  ) {}

  onModuleInit(): void {
    this.telegram.registerPhotoHandler(
      async (user, photo) => this.fromPhoto(user, await photo.download(), photo.mimeType),
      { id: 'receipt', label: { en: '🧾 A receipt', ru: '🧾 Это чек' } },
    );
    // "Delete" under the reply: the transaction goes, and the receipt with it.
    this.telegram.registerAction({
      name: 'rcpdel',
      handler: async (user, id) => {
        await this.transactions.remove(user.id, id).catch(() => undefined);
        return financeMessages(user.locale).receiptRemoved;
      },
    });
  }

  /** Reads a receipt and records it; the reply tells what was recorded. */
  async fromPhoto(user: UserRow, data: Buffer, mimeType: string): Promise<string> {
    const text = financeMessages(user.locale);
    const answer = await this.ai
      .completeWithImage(
        user.id,
        INSTRUCTION(await this.categories(user.id)),
        { data, mimeType },
        'finance',
      )
      .catch(() => undefined);
    if (answer === null) {
      return text.receiptNoVision;
    }
    const today = zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
    const read = answer
      ? parseReceipt(answer, { currency: await this.settings.mainCurrency(user.id), today })
      : null;
    if (!read) {
      return text.receiptUnreadable;
    }
    const transaction = await this.transactions.create(user.id, {
      kind: 'expense',
      amount: read.total,
      currency: read.currency,
      category: read.category,
      note: read.shop || null,
      occurredOn: read.date,
    });
    await this.db
      .insert(financeReceipts)
      .values({ transactionId: transaction.id, userId: user.id, data, mimeType });
    await this.telegram.sendMessage(user.telegramChatId ?? '', text.receiptSaved(read), [
      { label: text.receiptDelete, action: `rcpdel:${transaction.id}` },
    ]);
    return '';
  }

  /** The photo of a transaction's receipt. */
  async photo(userId: string, transactionId: string): Promise<{ data: Buffer; mimeType: string }> {
    const [receipt] = await this.db
      .select({ data: financeReceipts.data, mimeType: financeReceipts.mimeType })
      .from(financeReceipts)
      .where(
        and(eq(financeReceipts.transactionId, transactionId), eq(financeReceipts.userId, userId)),
      );
    if (!receipt) {
      throw new NotFoundException();
    }
    return receipt;
  }

  private async categories(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ category: transactions.category })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.kind, 'expense')))
      .groupBy(transactions.category)
      .orderBy(sql`count(*) desc`)
      .limit(CATEGORY_HINTS);
    return rows.map((row) => row.category);
  }
}
