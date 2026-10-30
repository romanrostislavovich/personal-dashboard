import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {AppConfig, DB, Database, ProjectsService} from '@pd/api-core';
import {
  DateParts,
  RecurringPayment,
  recurringPaymentInputSchema,
  todayIn,
  toLocalDate,
} from '@pd/contracts';
import {and, asc, desc, eq, ilike, min, or} from 'drizzle-orm';
import {z} from 'zod';
import {
  RecurringPaymentRow,
  recurringPayments,
  recurringPrices,
  transactions,
} from '../finance.schema';
import {contractDates} from './contract-dates';
import {dueChargeDate} from './due-charge-date';

export type ValidRecurringPaymentInput = z.output<
  typeof recurringPaymentInputSchema
>;

@Injectable()
export class RecurringPaymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly projects: ProjectsService,
  ) {}

  async list(userId: string): Promise<RecurringPayment[]> {
    const today = toLocalDate(this.today());
    const [rows, prices] = await Promise.all([
      this.rows(userId),
      this.db
        .select()
        .from(recurringPrices)
        .where(eq(recurringPrices.userId, userId))
        .orderBy(desc(recurringPrices.changedOn)),
    ]);
    const firstCharges = await this.firstCharges(userId, rows);
    return rows.map(row =>
      toRecurringPayment(
        row,
        prices.filter(price => price.recurringPaymentId === row.id),
        today,
        firstCharges.get(row.id) ?? null,
      ),
    );
  }

  /**
   * The first charge seen of each contract given without its start: the earliest expense the
   * payment made, or one whose note carries the payment's name (a bank import).
   */
  private async firstCharges(
    userId: string,
    rows: RecurringPaymentRow[],
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    for (const row of rows.filter(
      one => one.contractMonths && !one.contractStartedOn,
    )) {
      const [first] = await this.db
        .select({day: min(transactions.occurredOn)})
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.kind, 'expense'),
            or(
              eq(transactions.recurringPaymentId, row.id),
              ilike(transactions.note, `%${likeEscaped(row.name.trim())}%`),
            ),
          ),
        );
      if (first?.day) {
        found.set(row.id, first.day);
      }
    }
    return found;
  }

  /** The rows as they are, with the fields the jobs need (trial reminder, noticed price). */
  rows(userId: string): Promise<RecurringPaymentRow[]> {
    return this.db
      .select()
      .from(recurringPayments)
      .where(eq(recurringPayments.userId, userId))
      .orderBy(asc(recurringPayments.dayOfMonth), asc(recurringPayments.name));
  }

  async create(
    userId: string,
    input: ValidRecurringPaymentInput,
  ): Promise<RecurringPayment> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    // No backdated charges: if this month's charge day has already passed,
    // this month counts as paid; the first automatic charge will be next month.
    const lastChargedOn = dueChargeDate(
      {...input, lastChargedOn: null},
      this.today(),
    );
    const [row] = await this.db
      .insert(recurringPayments)
      .values({userId, ...normalized(input), lastChargedOn})
      .returning();
    return toRecurringPayment(row, [], toLocalDate(this.today()));
  }

  async update(
    userId: string,
    id: string,
    input: ValidRecurringPaymentInput,
  ): Promise<RecurringPayment> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    const [current] = await this.db
      .select()
      .from(recurringPayments)
      .where(
        and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
      );
    if (!current) {
      throw new NotFoundException();
    }
    await this.db.transaction(async tx => {
      // A new price keeps the old one in the history ("was 9.99 until October").
      if (current.amount !== input.amount) {
        await tx.insert(recurringPrices).values({
          userId,
          recurringPaymentId: id,
          amount: current.amount,
          changedOn: toLocalDate(this.today()),
        });
      }
      await tx
        .update(recurringPayments)
        .set({...normalized(input), noticedAmount: null})
        .where(
          and(
            eq(recurringPayments.id, id),
            eq(recurringPayments.userId, userId),
          ),
        );
    });
    return (await this.list(userId)).find(
      payment => payment.id === id,
    ) as RecurringPayment;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(recurringPayments)
      .where(
        and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)),
      );
  }

  /** Remembers what was reported, so each fact is told once. */
  async markNoticed(
    id: string,
    fields: {
      trialNotifiedFor?: string;
      noticedAmount?: number;
      datesNotified?: string[];
    },
  ): Promise<void> {
    await this.db
      .update(recurringPayments)
      .set(fields)
      .where(eq(recurringPayments.id, id));
  }

  /** Makes all of the user's due payments and returns the ones made. */
  async chargeDue(userId: string): Promise<RecurringPayment[]> {
    const today = this.today();
    const charged: RecurringPayment[] = [];

    for (const payment of await this.list(userId)) {
      const chargeDate = dueChargeDate(payment, today);
      if (!chargeDate) {
        continue;
      }
      // The transaction and the charge mark are written atomically to avoid duplicates.
      await this.db.transaction(async tx => {
        await tx.insert(transactions).values({
          userId,
          projectId: payment.projectId,
          recurringPaymentId: payment.id,
          kind: 'expense',
          amount: payment.amount,
          currency: payment.currency,
          category: payment.category,
          note: payment.name,
          occurredOn: chargeDate,
        });
        await tx
          .update(recurringPayments)
          .set({lastChargedOn: chargeDate})
          .where(eq(recurringPayments.id, payment.id));
      });
      charged.push({...payment, lastChargedOn: chargeDate});
    }
    return charged;
  }

  today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', {infer: true}));
  }
}

/** A monthly payment has no month of the year. */
function normalized(input: ValidRecurringPaymentInput) {
  return {
    ...input,
    monthOfYear: input.period === 'year' ? (input.monthOfYear ?? null) : null,
    trialEndsOn: input.trialEndsOn ?? null,
    contractStartedOn: input.contractStartedOn ?? null,
    contractMonths: input.contractMonths ?? null,
    noticeDays: input.noticeDays ?? null,
    priceLockedUntil: input.priceLockedUntil ?? null,
  };
}

/** A name as a literal inside an ILIKE pattern. */
function likeEscaped(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

function toRecurringPayment(
  row: RecurringPaymentRow,
  prices: {amount: number; changedOn: string}[],
  today: string,
  firstCharge: string | null = null,
): RecurringPayment {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    dayOfMonth: row.dayOfMonth,
    period: row.period,
    monthOfYear: row.monthOfYear,
    trialEndsOn: row.trialEndsOn,
    projectId: row.projectId,
    isActive: row.isActive,
    lastChargedOn: row.lastChargedOn,
    priceHistory: prices.map(({amount, changedOn}) => ({amount, changedOn})),
    contractStartedOn: row.contractStartedOn,
    contractMonths: row.contractMonths,
    noticeDays: row.noticeDays,
    autoRenews: row.autoRenews,
    priceLockedUntil: row.priceLockedUntil,
    contract: contractDates(row, firstCharge, today),
  };
}
