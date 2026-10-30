import {Inject, Injectable, Logger} from '@nestjs/common';
import {
  BotActionReply,
  DB,
  Database,
  NotificationsService,
  UserRow,
  UsersService,
} from '@pd/api-core';
import {
  HealthIntake,
  IntakeStatus,
  LocalDate,
  zonedDateTime,
} from '@pd/contracts';
import {and, desc, eq, gte, sql} from 'drizzle-orm';
import {healthMessages} from '../health.messages';
import {
  HealthIntakeRow,
  healthIntakes,
  healthMedications,
} from '../health.schema';
import {found} from '../owned';

/** The Telegram button under a reminder: `<name>:<t|s>:<intake id>`. */
export const INTAKE_ACTION = 'hti';

/** A time missed by a restart is still sent within this many minutes, never later. */
const CATCH_UP_MINUTES = 30;

/** The times of a medication to remind of now: come, and not long ago. */
export function dueTimes(times: readonly string[], now: string): string[] {
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const current = minutes(now);
  return times.filter(time => {
    const at = minutes(time);
    return at <= current && current - at < CATCH_UP_MINUTES;
  });
}

/** The reminders of the last days and their answers. */
export async function recentIntakes(
  db: Database,
  userId: string,
  since: LocalDate,
): Promise<HealthIntake[]> {
  const rows = await db
    .select()
    .from(healthIntakes)
    .where(and(eq(healthIntakes.userId, userId), gte(healthIntakes.day, since)))
    .orderBy(desc(healthIntakes.day), desc(healthIntakes.time));
  return rows.map(toIntake);
}

/**
 * Reminders to take medications at their times on the user's own clock, with "Taken" and
 * "Skip" under them; the answers are kept, so the page shows how the taking went.
 */
@Injectable()
export class IntakesService {
  private readonly logger = new Logger(IntakesService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every minute: each time that has come is sent once (one row a medication, day and time). */
  async fireDue(now: Date = new Date()): Promise<void> {
    const medications = await this.db
      .select({
        id: healthMedications.id,
        userId: healthMedications.userId,
        name: healthMedications.name,
        dose: healthMedications.dose,
        startedOn: healthMedications.startedOn,
        stoppedOn: healthMedications.stoppedOn,
        times: healthMedications.reminderTimes,
      })
      .from(healthMedications)
      .where(sql`cardinality(${healthMedications.reminderTimes}) > 0`);
    const users = new Map<string, UserRow | undefined>();
    for (const medication of medications) {
      if (!users.has(medication.userId)) {
        users.set(
          medication.userId,
          await this.users.findById(medication.userId),
        );
      }
      const user = users.get(medication.userId);
      if (!user) {
        continue;
      }
      const {date, time} = zonedDateTime(now, this.users.timeZoneOf(user));
      const taken =
        (!medication.startedOn || medication.startedOn <= date) &&
        (!medication.stoppedOn || medication.stoppedOn >= date);
      if (!taken) {
        continue;
      }
      for (const due of dueTimes(medication.times, time)) {
        await this.send(user, medication, date, due).catch(error =>
          this.logger.warn(`A medication reminder was not sent: ${error}`),
        );
      }
    }
  }

  async answer(
    userId: string,
    id: string,
    status: Exclude<IntakeStatus, 'pending'>,
  ) {
    const [row] = await this.db
      .update(healthIntakes)
      .set({status, answeredAt: new Date()})
      .where(and(eq(healthIntakes.id, id), eq(healthIntakes.userId, userId)))
      .returning();
    return toIntake(found(row, 'Intake'));
  }

  /** A button under the reminder in Telegram. */
  async answerButton(user: UserRow, payload: string): Promise<BotActionReply> {
    const [what, id] = payload.split(':');
    const text = healthMessages(user.locale).intake;
    try {
      await this.answer(user.id, id, what === 't' ? 'taken' : 'skipped');
      return what === 't' ? text.taken : text.skipped;
    } catch {
      return text.gone;
    }
  }

  private async send(
    user: UserRow,
    medication: {id: string; name: string; dose: string | null},
    day: LocalDate,
    time: string,
  ): Promise<void> {
    const [intake] = await this.db
      .insert(healthIntakes)
      .values({userId: user.id, medicationId: medication.id, day, time})
      .onConflictDoNothing()
      .returning({id: healthIntakes.id});
    // Another run sent it already.
    if (!intake) {
      return;
    }
    const text = healthMessages(user.locale).intake;
    await this.notifications.send(user.id, {
      title: text.title,
      body: [medication.name, medication.dose].filter(Boolean).join(' — '),
      source: 'health',
      actions: [
        {label: text.buttons.taken, action: `${INTAKE_ACTION}:t:${intake.id}`},
        {label: text.buttons.skip, action: `${INTAKE_ACTION}:s:${intake.id}`},
      ],
    });
  }
}

function toIntake(row: HealthIntakeRow): HealthIntake {
  return {
    id: row.id,
    medicationId: row.medicationId,
    day: row.day,
    time: row.time,
    status: row.status,
  };
}
