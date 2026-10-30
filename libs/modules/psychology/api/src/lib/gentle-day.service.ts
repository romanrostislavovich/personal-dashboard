import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import {DB, Database} from '@pd/api-core';
import {
  GentleDay,
  GentleDayStep,
  gentleDayInputSchema,
  GentleStep,
  GentleStepInput,
  LocalDate,
} from '@pd/contracts';
import {and, asc, eq} from 'drizzle-orm';
import {z} from 'zod';
import {psychologyGentleDays, psychologyGentleSteps} from './psychology.schema';

type ValidGentleDay = z.output<typeof gentleDayInputSchema>;

/**
 * A gentle day: the user turns it on by themselves on a hard day and picks up to three small
 * steps of their own. Nothing here judges: no streaks, no "missed", nothing is carried over to
 * the next day, and the mode is never turned on from the mood or anything else.
 */
@Injectable()
export class GentleDayService {
  constructor(@Inject(DB) private readonly db: Database) {}

  // --- The library of steps ---

  async steps(userId: string): Promise<GentleStep[]> {
    const rows = await this.db
      .select()
      .from(psychologyGentleSteps)
      .where(eq(psychologyGentleSteps.userId, userId))
      .orderBy(asc(psychologyGentleSteps.createdAt));
    return rows.map(row => ({
      id: row.id,
      text: row.text,
      smaller: row.smaller,
    }));
  }

  async addStep(userId: string, input: GentleStepInput): Promise<GentleStep> {
    const [row] = await this.db
      .insert(psychologyGentleSteps)
      .values({userId, text: input.text, smaller: input.smaller || null})
      .returning();
    return {id: row.id, text: row.text, smaller: row.smaller};
  }

  async updateStep(
    userId: string,
    id: string,
    input: GentleStepInput,
  ): Promise<GentleStep> {
    const [row] = await this.db
      .update(psychologyGentleSteps)
      .set({text: input.text, smaller: input.smaller || null})
      .where(
        and(
          eq(psychologyGentleSteps.id, id),
          eq(psychologyGentleSteps.userId, userId),
        ),
      )
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return {id: row.id, text: row.text, smaller: row.smaller};
  }

  async removeStep(userId: string, id: string): Promise<void> {
    await this.db
      .delete(psychologyGentleSteps)
      .where(
        and(
          eq(psychologyGentleSteps.id, id),
          eq(psychologyGentleSteps.userId, userId),
        ),
      );
  }

  // --- The day ---

  async day(userId: string, date: LocalDate): Promise<GentleDay> {
    const [row] = await this.db
      .select()
      .from(psychologyGentleDays)
      .where(
        and(
          eq(psychologyGentleDays.userId, userId),
          eq(psychologyGentleDays.localDate, date),
        ),
      );
    return row
      ? {date, on: true, steps: parseSteps(row.steps)}
      : {date, on: false, steps: []};
  }

  /** Turns the mode on for the day, or changes its steps and their states. */
  async saveDay(userId: string, input: ValidGentleDay): Promise<GentleDay> {
    const steps: GentleDayStep[] = input.steps.map(step => ({
      text: step.text,
      smaller: step.smaller || null,
      state: step.state,
    }));
    await this.db
      .insert(psychologyGentleDays)
      .values({userId, localDate: input.date, steps: JSON.stringify(steps)})
      .onConflictDoUpdate({
        target: [psychologyGentleDays.userId, psychologyGentleDays.localDate],
        set: {steps: JSON.stringify(steps), updatedAt: new Date()},
      });
    return {date: input.date as LocalDate, on: true, steps};
  }

  /** Leaving the mode: the plan of the day is gone, nothing else changes. */
  async leaveDay(userId: string, date: LocalDate): Promise<void> {
    await this.db
      .delete(psychologyGentleDays)
      .where(
        and(
          eq(psychologyGentleDays.userId, userId),
          eq(psychologyGentleDays.localDate, date),
        ),
      );
  }
}

/** A plan that cannot be read is an empty one rather than an error on a hard day. */
function parseSteps(json: string): GentleDayStep[] {
  try {
    const steps = JSON.parse(json) as unknown;
    return Array.isArray(steps) ? (steps as GentleDayStep[]) : [];
  } catch {
    return [];
  }
}
