import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, DB, Database, ProjectsService } from '@pd/api-core';
import { DateParts, RecurringPayment, recurringPaymentInputSchema, todayIn } from '@pd/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { RecurringPaymentRow, recurringPayments, transactions } from '../finance.schema';
import { dueChargeDate } from './due-charge-date';

export type ValidRecurringPaymentInput = z.output<typeof recurringPaymentInputSchema>;

@Injectable()
export class RecurringPaymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ConfigService) private readonly config: AppConfig,
    private readonly projects: ProjectsService,
  ) {}

  async list(userId: string): Promise<RecurringPayment[]> {
    const rows = await this.db
      .select()
      .from(recurringPayments)
      .where(eq(recurringPayments.userId, userId))
      .orderBy(asc(recurringPayments.dayOfMonth), asc(recurringPayments.name));
    return rows.map(toRecurringPayment);
  }

  async create(userId: string, input: ValidRecurringPaymentInput): Promise<RecurringPayment> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    // No backdated charges: if this month's charge day has already passed,
    // this month counts as paid; the first automatic charge will be next month.
    const lastChargedOn = dueChargeDate({ ...input, lastChargedOn: null }, this.today());
    const [row] = await this.db
      .insert(recurringPayments)
      .values({ userId, ...input, lastChargedOn })
      .returning();
    return toRecurringPayment(row);
  }

  async update(
    userId: string,
    id: string,
    input: ValidRecurringPaymentInput,
  ): Promise<RecurringPayment> {
    if (input.projectId) {
      await this.projects.assertOwned(userId, input.projectId);
    }
    const [row] = await this.db
      .update(recurringPayments)
      .set(input)
      .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return toRecurringPayment(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db
      .delete(recurringPayments)
      .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, userId)));
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
      await this.db.transaction(async (tx) => {
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
          .set({ lastChargedOn: chargeDate })
          .where(eq(recurringPayments.id, payment.id));
      });
      charged.push({ ...payment, lastChargedOn: chargeDate });
    }
    return charged;
  }

  private today(): DateParts {
    return todayIn(this.config.get('APP_TIMEZONE', { infer: true }));
  }
}

function toRecurringPayment(row: RecurringPaymentRow): RecurringPayment {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    dayOfMonth: row.dayOfMonth,
    projectId: row.projectId,
    isActive: row.isActive,
    lastChargedOn: row.lastChargedOn,
  };
}
