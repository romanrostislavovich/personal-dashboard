import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BotActionReply,
  DB,
  Database,
  NotificationsService,
  UserRow,
  UsersService,
} from '@pd/api-core';
import {
  addDays,
  Habit,
  HABIT_CALENDAR_DAYS,
  HabitDay,
  HabitDayInput,
  HabitDayStatus,
  habitStats,
  isBuilding,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  ValidHabitInput,
  zonedDateTime,
} from '@pd/contracts';
import { and, asc, eq, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { habitsMessages } from './habits.messages';
import { HabitDayRow, habitDays, HabitRow, habits } from './habits.schema';

/** The Telegram buttons under the evening question: `<name>:<c|u>:<habit id>:<day>`. */
export const HABIT_ACTION = 'hb';
/** The evening question missed by a restart is still asked within this many minutes. */
const CATCH_UP_MINUTES = 30;

/**
 * Habits to quit or cut down: their days, their numbers and the evening question in Telegram.
 * A day nobody marked is clean (see habitStats), so the counter works without any answer.
 */
@Injectable()
export class HabitsService {
  private readonly logger = new Logger(HabitsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string): Promise<Habit[]> {
    const rows = await this.db
      .select()
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.createdAt));
    if (!rows.length) {
      return [];
    }
    const marks = await this.db
      .select()
      .from(habitDays)
      .where(eq(habitDays.userId, userId))
      .orderBy(asc(habitDays.day));
    const today = await this.today(userId);
    return rows.map((row) =>
      toHabit(
        row,
        marks.filter((mark) => mark.habitId === row.id),
        today,
      ),
    );
  }

  async get(userId: string, id: string): Promise<Habit> {
    const habit = (await this.list(userId)).find((candidate) => candidate.id === id);
    if (!habit) {
      throw new NotFoundException('Habit not found');
    }
    return habit;
  }

  async create(userId: string, input: ValidHabitInput): Promise<Habit> {
    const [row] = await this.db
      .insert(habits)
      .values({ userId, ...fields(input) })
      .returning({ id: habits.id });
    return this.get(userId, row.id);
  }

  async update(userId: string, id: string, input: ValidHabitInput): Promise<Habit> {
    const [row] = await this.db
      .update(habits)
      .set({ ...fields(input), updatedAt: new Date() })
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning({ id: habits.id });
    if (!row) {
      throw new NotFoundException('Habit not found');
    }
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId)));
  }

  /** A day with it (and how much) or clean; one mark a day. */
  async mark(userId: string, id: string, day: LocalDate, input: HabitDayInput): Promise<Habit> {
    await this.owned(userId, id);
    const amount = input.status === 'used' ? (input.amount ?? null) : null;
    await this.db
      .insert(habitDays)
      .values({ userId, habitId: id, day, status: input.status, amount })
      .onConflictDoUpdate({
        target: [habitDays.habitId, habitDays.day],
        set: { status: input.status, amount },
      });
    return this.get(userId, id);
  }

  /** The mark taken off: the day is clean again, as an unmarked one. */
  async unmark(userId: string, id: string, day: LocalDate): Promise<Habit> {
    await this.owned(userId, id);
    await this.db
      .delete(habitDays)
      .where(and(eq(habitDays.habitId, id), eq(habitDays.userId, userId), eq(habitDays.day, day)));
    return this.get(userId, id);
  }

  /** Every minute: the evening question of each habit whose time has come, once a day. */
  async askDue(now: Date = new Date()): Promise<void> {
    const due = await this.db.select().from(habits).where(isNotNull(habits.askAt));
    const users = new Map<string, UserRow | undefined>();
    for (const habit of due) {
      if (!users.has(habit.userId)) {
        users.set(habit.userId, await this.users.findById(habit.userId));
      }
      const user = users.get(habit.userId);
      if (!user || !habit.askAt) {
        continue;
      }
      const { date, time } = zonedDateTime(now, this.users.timeZoneOf(user));
      if (date < habit.startedOn || habit.askedOn === date || !isDue(habit.askAt, time)) {
        continue;
      }
      await this.ask(user, habit, date).catch((error) =>
        this.logger.warn(`An evening question was not sent: ${error}`),
      );
    }
  }

  /** A button under the evening question. */
  async answerButton(user: UserRow, payload: string): Promise<BotActionReply> {
    const [what, id, day] = payload.split(':');
    const text = habitsMessages(user.locale);
    // A habit to build: done, or not today (no mark).
    if (what === 'd' || what === 'n') {
      try {
        const habit =
          what === 'd'
            ? await this.mark(user.id, id, day, { status: 'done' })
            : await this.unmark(user.id, id, day);
        return what === 'd' ? text.done(habit.stats.currentStreak) : text.notToday;
      } catch {
        return text.gone;
      }
    }
    const status: HabitDayStatus = what === 'u' ? 'used' : 'clean';
    let habit: Habit;
    try {
      habit = await this.mark(user.id, id, day, { status });
    } catch {
      return text.gone;
    }
    if (status === 'clean') {
      return text.clean(habit.stats.currentStreak);
    }
    if (!habit.unit) {
      return text.used;
    }
    const unit = habit.unit;
    return {
      reply: `${text.used}\n${text.howMuch(unit)}`,
      expectText: async (answerer, answer) => {
        const amount = Number(answer.trim().replace(',', '.'));
        if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) {
          return text.noAmount;
        }
        await this.mark(answerer.id, id, day, { status: 'used', amount });
        return text.amount(amount, unit);
      },
    };
  }

  private async ask(user: UserRow, habit: HabitRow, day: LocalDate): Promise<void> {
    // Taken by this run only: another run (or instance) asking at the same minute gets nothing.
    const [claimed] = await this.db
      .update(habits)
      .set({ askedOn: day })
      .where(
        and(
          eq(habits.id, habit.id),
          eq(habits.userId, user.id),
          or(isNull(habits.askedOn), ne(habits.askedOn, day)),
        ),
      )
      .returning({ askedOn: habits.askedOn });
    if (!claimed) {
      return;
    }
    const text = habitsMessages(user.locale);
    const streak = (await this.get(user.id, habit.id)).stats.currentStreak;
    if (isBuilding(habit.goal)) {
      await this.notifications.send(user.id, {
        title: text.question.build(habit.name ?? ''),
        body: text.buildBody(streak),
        source: 'habits',
        actions: [
          { label: text.buttons.done, action: `${HABIT_ACTION}:d:${habit.id}:${day}` },
          { label: text.buttons.notToday, action: `${HABIT_ACTION}:n:${habit.id}:${day}` },
        ],
      });
      return;
    }
    await this.notifications.send(user.id, {
      title:
        habit.kind === 'custom'
          ? text.question.custom(habit.name ?? '')
          : text.question[habit.kind],
      body: text.body(streak),
      source: 'habits',
      actions: [
        { label: text.buttons.clean, action: `${HABIT_ACTION}:c:${habit.id}:${day}` },
        { label: text.buttons.used, action: `${HABIT_ACTION}:u:${habit.id}:${day}` },
      ],
    });
  }

  private async owned(userId: string, id: string): Promise<void> {
    const [row] = await this.db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)));
    if (!row) {
      throw new NotFoundException('Habit not found');
    }
  }

  private async today(userId: string): Promise<LocalDate> {
    const user = await this.users.findById(userId);
    return zonedDateTime(new Date(), this.users.timeZoneOf(user)).date;
  }
}

/** The time of the question has come, not long ago. */
export function isDue(askAt: string, now: string): boolean {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const late = minutes(now) - minutes(askAt);
  return late >= 0 && late < CATCH_UP_MINUTES;
}

function fields(input: ValidHabitInput) {
  return {
    kind: input.kind,
    name: input.kind === 'custom' ? input.name : null,
    goal: input.goal,
    maxDaysPerWeek: input.goal === 'less' ? (input.maxDaysPerWeek ?? 0) : null,
    timesPerWeek: input.goal === 'weekly' ? (input.timesPerWeek ?? 1) : null,
    unit: input.unit,
    startedOn: input.startedOn,
    askAt: input.askAt ?? null,
  };
}

function toHabit(row: HabitRow, marks: HabitDayRow[], today: LocalDate): Habit {
  const days: HabitDay[] = marks.map((mark) => ({
    day: mark.day,
    status: mark.status,
    amount: mark.amount,
  }));
  const since = toLocalDate(addDays(parseLocalDate(today), -HABIT_CALENDAR_DAYS));
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    goal: row.goal,
    maxDaysPerWeek: row.maxDaysPerWeek,
    timesPerWeek: row.timesPerWeek,
    unit: row.unit,
    startedOn: row.startedOn,
    askAt: row.askAt,
    stats: habitStats(row, days, today),
    recent: days.filter((mark) => mark.day > since),
  };
}
