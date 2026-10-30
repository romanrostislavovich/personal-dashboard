import {Inject, Injectable, OnModuleInit} from '@nestjs/common';
import {DB, Database, TelegramBotService, UsersService} from '@pd/api-core';
import {zonedDateTime} from '@pd/contracts';
import {and, eq, sql} from 'drizzle-orm';
import {FinanceSettingsService} from '../currency/finance-settings.service';
import {transactions} from '../finance.schema';
import {categoryFor, parseSpent} from './spent-command';
import {TransactionsService} from './transactions.service';

/** `/spent 12 coffee` in Telegram: an expense of today, in a category the user already has. */
@Injectable()
export class SpentTelegram implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly telegram: TelegramBotService,
    private readonly users: UsersService,
    private readonly transactions: TransactionsService,
    private readonly settings: FinanceSettingsService,
  ) {}

  onModuleInit(): void {
    this.telegram.registerCommand({
      command: 'spent',
      description: {
        en: 'An expense: /spent 12 coffee (or /spent 12 EUR taxi)',
        ru: 'Расход: /spent 12 кофе (или /spent 12 EUR такси)',
      },
      handler: async (user, args) => {
        const ru = user.locale === 'ru';
        const spent = parseSpent(args);
        if (!spent) {
          return ru
            ? 'Например: /spent 12 кофе'
            : 'For example: /spent 12 coffee';
        }
        const known = await this.db
          .selectDistinct({category: transactions.category})
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, user.id),
              sql`${transactions.kind} = 'expense'`,
            ),
          );
        const category = categoryFor(
          spent.what,
          known.map(row => row.category),
          ru ? 'Другое' : 'Other',
        );
        const currency =
          spent.currency ?? (await this.settings.mainCurrency(user.id));
        await this.transactions.create(user.id, {
          kind: 'expense',
          amount: spent.amount,
          currency,
          category,
          note: spent.what || null,
          occurredOn: zonedDateTime(new Date(), this.users.timeZoneOf(user))
            .date,
        });
        return `💸 ${spent.amount} ${currency} — ${category}`;
      },
    });
  }
}
