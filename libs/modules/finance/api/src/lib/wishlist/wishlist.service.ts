import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiService,
  AutomationsService,
  DB,
  Database,
  NotificationsService,
  UsersService,
} from '@pd/api-core';
import { BUDGET_TOTAL, toLocalDate, Wish, wishInputSchema, WishPricePoint } from '@pd/contracts';
import { and, asc, desc, eq, isNotNull, isNull, max, min } from 'drizzle-orm';
import { z } from 'zod';
import { BudgetsService } from '../budgets/budgets.service';
import { ExchangeRatesService } from '../currency/exchange-rates.service';
import { FinanceSettingsService } from '../currency/finance-settings.service';
import { financeMessages } from '../finance.messages';
import { WishRow, wishes, wishPrices } from '../finance.schema';
import { GoalsService } from '../goals/goals.service';
import { RecurringPaymentsService } from '../recurring/recurring-payments.service';
import { TransactionsService } from '../transactions/transactions.service';
import { againstBudget, againstGoal } from './affordable';
import { fetchPage } from './fetch-page';
import { pageText, parseAiProduct, readProductPage } from './product-page';

type ValidWishInput = z.output<typeof wishInputSchema>;

/** The category of the expense a bought wish is recorded as. */
const PURCHASE_CATEGORY = 'Shopping';
/** The page loaded, but nothing on it tells a price. */
const NO_PRICE = 'no-price';
/** How much of a page's text the AI gets: the price is near the top. */
const AI_TEXT_LIMIT = 6000;
const AI_INSTRUCTION =
  'The text of a product page of an online shop follows. Answer with JSON only: ' +
  '{"price": number, "currency": "ISO 4217 code"} — the current price of the main product of ' +
  'the page: not an accessory, not a crossed-out old price, not a monthly instalment. ' +
  'If the text has no such price, answer {"price": null, "currency": null}.';

/** What a check of a wish's page gave. */
interface Reading {
  name: string | null;
  image: string | null;
  price: number | null;
  currency: string | null;
  error: string | null;
}

/**
 * Things to buy one day. A wish is a link to a product in a shop: its price is read from the page
 * when the wish is added, every morning (WishlistJob) and on request, kept day by day, and every
 * change is reported. A page that tells no price leaves the one typed in by hand.
 */
@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly recurring: RecurringPaymentsService,
    private readonly settings: FinanceSettingsService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly users: UsersService,
    private readonly ai: AiService,
    private readonly goals: GoalsService,
    private readonly budgets: BudgetsService,
    private readonly rates: ExchangeRatesService,
    private readonly transactions: TransactionsService,
  ) {}

  /** The ones still wanted first, the newest on top. */
  async list(userId: string): Promise<Wish[]> {
    const rows = await this.db
      .select()
      .from(wishes)
      .where(eq(wishes.userId, userId))
      .orderBy(isNotNull(wishes.boughtAt), desc(wishes.createdAt));
    const ranges = await this.db
      .select({
        wishId: wishPrices.wishId,
        currency: wishPrices.currency,
        lowest: min(wishPrices.price).mapWith(Number),
        highest: max(wishPrices.price).mapWith(Number),
      })
      .from(wishPrices)
      .where(eq(wishPrices.userId, userId))
      .groupBy(wishPrices.wishId, wishPrices.currency);
    const money = await this.money(userId, rows);
    return rows.map((row) => ({
      ...toWish(
        row,
        ranges.find((range) => range.wishId === row.id && range.currency === row.currency),
      ),
      ...money(row),
    }));
  }

  /**
   * The wishes against the money: the goal each is saved for, and this month's budget of all
   * expenses. A price in another currency is converted at today's rate.
   */
  private async money(
    userId: string,
    rows: WishRow[],
  ): Promise<(row: WishRow) => Pick<Wish, 'goal' | 'budget'>> {
    const wanted = rows.filter((row) => !row.boughtAt && row.price !== null && row.currency);
    if (!wanted.length) {
      return () => ({ goal: null, budget: null });
    }
    const today = toLocalDate(this.recurring.today());
    const goals = wanted.some((row) => row.goalId) ? await this.goals.list(userId) : [];
    const [total] = (await this.budgets.list(userId, today.slice(0, 7))).filter(
      (budget) => budget.category === BUDGET_TOTAL,
    );
    const priceIn = async (row: WishRow, currency: string) =>
      row.currency === currency
        ? row.price
        : ((
            await this.rates.convert(
              [{ amount: row.price ?? 0, currency: row.currency ?? currency, day: today }],
              currency,
            )
          ).values[0] ?? null);

    const found = new Map<string, Pick<Wish, 'goal' | 'budget'>>();
    for (const row of wanted) {
      const goal = goals.find((item) => item.id === row.goalId);
      found.set(row.id, {
        goal: goal ? againstGoal(await priceIn(row, goal.currency), goal) : null,
        budget: total ? againstBudget(await priceIn(row, total.currency), total) : null,
      });
    }
    return (row) => found.get(row.id) ?? { goal: null, budget: null };
  }

  /** The price day by day, in the currency the wish has now. */
  async history(userId: string, id: string): Promise<WishPricePoint[]> {
    const row = await this.row(userId, id);
    if (!row.currency) {
      return [];
    }
    return this.db
      .select({ day: wishPrices.day, price: wishPrices.price })
      .from(wishPrices)
      .where(and(eq(wishPrices.wishId, id), eq(wishPrices.currency, row.currency)))
      .orderBy(asc(wishPrices.day));
  }

  async create(userId: string, input: ValidWishInput): Promise<Wish> {
    const reading = await this.read(userId, input.url);
    const [row] = await this.db
      .insert(wishes)
      .values({
        userId,
        url: input.url,
        name: input.name || reading.name || new URL(input.url).hostname,
        note: input.note || null,
        goalId: await this.ownGoal(userId, input.goalId),
        recipient: input.recipient || null,
        imageUrl: reading.image,
        checkedAt: new Date(),
        checkError: reading.error,
      })
      .returning();
    const price = reading.price ?? input.price ?? null;
    if (price !== null) {
      const currency = reading.price !== null ? reading.currency : input.currency;
      await this.setPrice(row, price, currency ?? (await this.settings.mainCurrency(userId)));
    }
    return this.get(userId, row.id);
  }

  async update(userId: string, id: string, input: ValidWishInput): Promise<Wish> {
    const row = await this.row(userId, id);
    await this.db
      .update(wishes)
      .set({
        url: input.url,
        name: input.name || row.name,
        note: input.note || null,
        // Left out — as it was; `null` — cleared.
        goalId: input.goalId === undefined ? row.goalId : await this.ownGoal(userId, input.goalId),
        recipient: input.recipient === undefined ? row.recipient : input.recipient || null,
      })
      .where(eq(wishes.id, id));
    if (input.price != null) {
      const currency = input.currency ?? row.currency ?? (await this.settings.mainCurrency(userId));
      if (input.price !== row.price || currency !== row.currency) {
        await this.setPrice(row, input.price, currency);
      }
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(wishes).where(and(eq(wishes.id, id), eq(wishes.userId, userId)));
  }

  /**
   * A bought wish stays in the list, but its price is not watched any more. With `record` the
   * purchase also becomes an expense of today at the wish's price — once: a wish that is
   * bought already is not recorded again.
   */
  async setBought(userId: string, id: string, bought: boolean, record = false): Promise<Wish> {
    const row = await this.row(userId, id);
    await this.db
      .update(wishes)
      .set({ boughtAt: bought ? new Date() : null })
      .where(eq(wishes.id, id));
    if (bought && record && !row.boughtAt && row.price !== null && row.currency) {
      await this.transactions.create(userId, {
        kind: 'expense',
        amount: row.price,
        currency: row.currency,
        category: PURCHASE_CATEGORY,
        note: row.name.slice(0, 500),
        occurredOn: toLocalDate(this.recurring.today()),
      });
    }
    return this.get(userId, id);
  }

  /** The gift ideas for the people of these names (lower case): the wishes not bought yet. */
  async giftIdeas(userId: string, names: string[]): Promise<Map<string, Wish[]>> {
    const ideas = new Map<string, Wish[]>();
    for (const wish of await this.list(userId)) {
      const name = wish.recipient?.trim().toLowerCase();
      if (name && !wish.boughtAt && names.includes(name)) {
        ideas.set(name, [...(ideas.get(name) ?? []), wish]);
      }
    }
    return ideas;
  }

  /** A goal of somebody else is not linked. */
  private async ownGoal(userId: string, goalId: string | null | undefined): Promise<string | null> {
    if (!goalId) {
      return null;
    }
    return (await this.goals.list(userId)).some((goal) => goal.id === goalId) ? goalId : null;
  }

  /** Reads the page of a wish again and tells about a changed price. */
  async check(userId: string, id: string): Promise<Wish> {
    await this.checkRow(await this.row(userId, id));
    return this.get(userId, id);
  }

  /** The daily check of everything still wanted, of every user. */
  async checkAll(): Promise<void> {
    const rows = await this.db.select().from(wishes).where(isNull(wishes.boughtAt));
    for (const row of rows) {
      try {
        await this.checkRow(row);
      } catch (error) {
        this.logger.warn(`Wish ${row.id} was not checked: ${String(error)}`);
      }
    }
  }

  private async checkRow(row: WishRow): Promise<void> {
    const reading = await this.read(row.userId, row.url);
    await this.db
      .update(wishes)
      .set({
        checkedAt: new Date(),
        checkError: reading.error,
        imageUrl: reading.image ?? row.imageUrl,
      })
      .where(eq(wishes.id, row.id));
    if (reading.price !== null) {
      const currency =
        reading.currency ?? row.currency ?? (await this.settings.mainCurrency(row.userId));
      await this.setPrice(row, reading.price, currency, true);
    }
  }

  /** The product of a page: what the shop tells in its markup, otherwise what the AI reads. */
  private async read(userId: string, url: string): Promise<Reading> {
    const page = await fetchPage(url);
    if ('error' in page) {
      return { name: null, image: null, price: null, currency: null, error: page.error };
    }
    const info = readProductPage(page.html);
    const found = info.price !== null ? info : ((await this.askAi(userId, page.html)) ?? info);
    return {
      name: info.name,
      image: info.image,
      price: found.price,
      currency: found.currency,
      error: found.price === null ? NO_PRICE : null,
    };
  }

  private async askAi(userId: string, html: string) {
    if (!(await this.ai.isConfigured(userId)) || !(await this.ai.canSee(userId, 'finance'))) {
      return null;
    }
    try {
      const text = pageText(html, AI_TEXT_LIMIT);
      return parseAiProduct(await this.ai.complete(userId, AI_INSTRUCTION, text, 'finance'));
    } catch (error) {
      this.logger.warn(`The AI did not read a product page: ${String(error)}`);
      return null;
    }
  }

  /**
   * Keeps a price as the current one and as the point of today. `row` is the wish as it was
   * before; `notify` — tell about a change (a price typed in by hand is not news).
   */
  private async setPrice(
    row: WishRow,
    price: number,
    currency: string,
    notify = false,
  ): Promise<void> {
    const sameCurrency = row.currency === currency;
    const changed = sameCurrency && row.price !== null && row.price !== price;
    const [{ lowest }] = await this.db
      .select({ lowest: min(wishPrices.price).mapWith(Number) })
      .from(wishPrices)
      .where(and(eq(wishPrices.wishId, row.id), eq(wishPrices.currency, currency)));

    await this.db
      .update(wishes)
      .set({
        price,
        currency,
        // Prices in another currency are not compared.
        previousPrice: changed ? row.price : sameCurrency ? row.previousPrice : null,
      })
      .where(eq(wishes.id, row.id));
    const day = toLocalDate(this.recurring.today());
    await this.db
      .insert(wishPrices)
      .values({ userId: row.userId, wishId: row.id, day, price, currency })
      .onConflictDoUpdate({
        target: [wishPrices.wishId, wishPrices.day],
        set: { price, currency },
      });

    if (changed && notify && row.price !== null) {
      await this.tell(row, row.price, price, currency, lowest !== null && price < lowest);
    }
  }

  private async tell(
    row: WishRow,
    was: number,
    now: number,
    currency: string,
    isLowest: boolean,
  ): Promise<void> {
    const text = financeMessages((await this.users.findById(row.userId))?.locale ?? 'en');
    await this.notifications.send(row.userId, {
      title: now < was ? text.wishCheaperTitle(row.name) : text.wishPricierTitle(row.name),
      body: text.wishPriceBody(was, now, currency, isLowest, row.url),
      source: 'finance',
    });
    await this.automations.emit(row.userId, 'finance.wish-price', {
      direction: now < was ? 'down' : 'up',
      name: row.name,
      price: now.toFixed(2),
      was: was.toFixed(2),
      currency,
      url: row.url,
    });
  }

  private async get(userId: string, id: string): Promise<Wish> {
    const wish = (await this.list(userId)).find((item) => item.id === id);
    if (!wish) {
      throw new NotFoundException();
    }
    return wish;
  }

  private async row(userId: string, id: string): Promise<WishRow> {
    const [row] = await this.db
      .select()
      .from(wishes)
      .where(and(eq(wishes.id, id), eq(wishes.userId, userId)));
    if (!row) {
      throw new NotFoundException();
    }
    return row;
  }
}

function toWish(row: WishRow, range?: { lowest: number; highest: number }): Wish {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    note: row.note,
    imageUrl: row.imageUrl,
    price: row.price,
    currency: row.currency,
    previousPrice: row.previousPrice,
    lowestPrice: range?.lowest ?? null,
    highestPrice: range?.highest ?? null,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    checkError: row.checkError,
    boughtAt: row.boughtAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    goalId: row.goalId,
    recipient: row.recipient,
    goal: null,
    budget: null,
  };
}
