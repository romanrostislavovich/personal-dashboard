import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  LifeCard,
  LifeGoal,
  lifeGoalInputSchema,
  LifeMetric,
  parseLocalDate,
  toLocalDate,
  zonedDateTime,
} from '@pd/contracts';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DB, Database } from '../database/database.module';
import { UsersService } from '../users/users.service';
import { goalStatus } from './goal-status';
import { lifeGoals } from './life.schema';
import { LifeService } from './life.service';

type ValidGoalInput = z.output<typeof lifeGoalInputSchema>;
type GoalRow = typeof lifeGoals.$inferSelect;

/** What a goal counted by hand looks like. */
const MANUAL = { icon: 'flag', format: 'number' as const };

/**
 * Goals of a year: "300 days with a diary entry", "5000 plays", "save 20 000". The progress is
 * the value of a summary card of the modules from the 1st of January to today (the same numbers
 * as the year's summary), or a number set by hand.
 */
@Injectable()
export class LifeGoalsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly life: LifeService,
    private readonly users: UsersService,
  ) {}

  async list(userId: string, year: number): Promise<LifeGoal[]> {
    const rows = await this.db
      .select()
      .from(lifeGoals)
      .where(and(eq(lifeGoals.userId, userId), eq(lifeGoals.year, year)))
      .orderBy(asc(lifeGoals.createdAt));
    if (!rows.length) {
      return [];
    }
    const today = await this.today(userId);
    const cards = rows.some((row) => row.metric)
      ? await this.life.period(userId, { from: `${year}-01-01`, to: `${year}-12-31` })
      : [];
    return rows.map((row) => toGoal(row, cards, today));
  }

  /** The cards of the last year: what a goal can be counted from. */
  async metrics(userId: string): Promise<LifeMetric[]> {
    const today = await this.today(userId);
    const from = toLocalDate(addDays(parseLocalDate(today), -365));
    const cards = await this.life.period(userId, { from, to: today });
    return cards.map(({ key, module, icon, format, currency }) => ({
      key,
      module,
      icon,
      format,
      currency,
    }));
  }

  async create(userId: string, input: ValidGoalInput): Promise<LifeGoal> {
    const [row] = await this.db
      .insert(lifeGoals)
      .values({ userId, ...input, metric: input.metric || null })
      .returning();
    return (await this.list(userId, row.year)).find((goal) => goal.id === row.id) as LifeGoal;
  }

  async update(userId: string, id: string, input: ValidGoalInput): Promise<LifeGoal> {
    const [row] = await this.db
      .update(lifeGoals)
      .set({ ...input, metric: input.metric || null, reachedAt: null })
      .where(and(eq(lifeGoals.id, id), eq(lifeGoals.userId, userId)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return (await this.list(userId, row.year)).find((goal) => goal.id === row.id) as LifeGoal;
  }

  /** The progress of a goal counted by hand. */
  async setProgress(userId: string, id: string, value: number): Promise<LifeGoal> {
    const [row] = await this.db
      .update(lifeGoals)
      .set({ manualValue: value })
      .where(and(eq(lifeGoals.id, id), eq(lifeGoals.userId, userId), isNull(lifeGoals.metric)))
      .returning();
    if (!row) {
      throw new NotFoundException();
    }
    return (await this.list(userId, row.year)).find((goal) => goal.id === row.id) as LifeGoal;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(lifeGoals).where(and(eq(lifeGoals.id, id), eq(lifeGoals.userId, userId)));
  }

  /** Goals of this year done and not reported yet; each is marked as reported. */
  async newlyDone(userId: string): Promise<LifeGoal[]> {
    const year = Number((await this.today(userId)).slice(0, 4));
    const done = (await this.list(userId, year)).filter((goal) => goal.status === 'done');
    const open = await this.db
      .select({ id: lifeGoals.id })
      .from(lifeGoals)
      .where(and(eq(lifeGoals.userId, userId), isNull(lifeGoals.reachedAt)));
    const fresh = done.filter((goal) => open.some((row) => row.id === goal.id));
    for (const goal of fresh) {
      await this.db
        .update(lifeGoals)
        .set({ reachedAt: new Date() })
        .where(eq(lifeGoals.id, goal.id));
    }
    return fresh;
  }

  private async today(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    return zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
  }
}

function toGoal(row: GoalRow, cards: LifeCard[], today: string): LifeGoal {
  const card = row.metric ? cards.find((candidate) => candidate.key === row.metric) : undefined;
  const value = row.metric ? (card?.value ?? 0) : row.manualValue;
  const direction = row.direction === 'atMost' ? 'atMost' : 'atLeast';
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    metric: row.metric,
    target: row.target,
    direction,
    value,
    format: card?.format ?? MANUAL.format,
    currency: card?.currency,
    icon: card?.icon ?? MANUAL.icon,
    ...goalStatus({ ...row, direction }, value, card?.aggregate === 'average', today),
  };
}
