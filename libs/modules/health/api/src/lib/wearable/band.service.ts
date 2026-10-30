import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  DB,
  Database,
  DeviceIdentity,
  NotificationsService,
  TelegramBotService,
  UserRow,
} from '@pd/api-core';
import {
  BandDayDetail,
  BandIngest,
  BandSession,
  LocalDate,
  MindfulnessInput,
  REACTION_FEELINGS,
  ReactionFeeling,
  zonedDateTime,
} from '@pd/contracts';
import {and, asc, eq, gt, gte, lt} from 'drizzle-orm';
import {BandDaysService, dayBounds} from './band-days.service';
import {median} from './band-math';
import {bandMessages} from './band.messages';
import {
  healthBandHours,
  healthBandMinutes,
  healthBandPoints,
  healthBandReactions,
  healthBandSessions,
  healthBandStressHours,
} from './band.schema';

/** The buttons of a reaction's notification: `band:f:<id>:<feeling>`. */
const ACTION = 'band';
/** A reaction is told about while it is this fresh (the band syncs late)… */
const NOTIFY_WITHIN_MS = 2 * 3600_000;
/** …and one at most in this many minutes, in the quiet hours too (the owner's choice). */
const NOTIFY_EVERY_MINUTES = 180;

type SessionRow = typeof healthBandSessions.$inferSelect;

/**
 * The band through the phone (docs/proposals/mobile-app.md, stage 3): the phone sends what
 * Health Connect has for a time window, the server replaces that window and counts the days it
 * touched again (BandDaysService); a fresh reaction of the body is told at once.
 */
@Injectable()
export class BandService implements OnModuleInit {
  private readonly logger = new Logger(BandService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly days: BandDaysService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramBotService,
  ) {}

  onModuleInit(): void {
    this.telegram.registerAction({
      name: ACTION,
      handler: (user, payload) => this.answer(user, payload),
    });
  }

  async ingest(
    device: DeviceIdentity,
    body: BandIngest,
  ): Promise<{saved: number}> {
    const {userId} = device;
    const from = new Date(body.from);
    const to = new Date(body.to);
    await this.db.transaction(async tx => {
      for (const table of [
        healthBandMinutes,
        healthBandHours,
        healthBandPoints,
      ]) {
        await tx
          .delete(table)
          .where(
            and(
              eq(table.userId, userId),
              gte(table.at, from),
              lt(table.at, to),
            ),
          );
      }
      const s = healthBandSessions;
      await tx
        .delete(s)
        .where(
          and(
            eq(s.userId, userId),
            eq(s.source, 'phone'),
            gte(s.startAt, from),
            lt(s.startAt, to),
          ),
        );
      if (body.minutes.length) {
        await tx
          .insert(healthBandMinutes)
          .values(body.minutes.map(m => ({userId, ...m, at: new Date(m.at)})))
          .onConflictDoNothing();
      }
      if (body.hours.length) {
        await tx
          .insert(healthBandHours)
          .values(body.hours.map(h => ({userId, ...h, at: new Date(h.at)})))
          .onConflictDoNothing();
      }
      if (body.points.length) {
        await tx
          .insert(healthBandPoints)
          .values(body.points.map(p => ({userId, ...p, at: new Date(p.at)})))
          .onConflictDoNothing();
      }
      if (body.sessions.length) {
        // A session made in the dashboard at the same moment stays.
        await tx
          .insert(s)
          .values(
            body.sessions.map(one => ({
              userId,
              ...one,
              startAt: new Date(one.startAt),
              endAt: new Date(one.endAt),
            })),
          )
          .onConflictDoNothing();
      }
    });
    const moments = [
      from,
      new Date(to.getTime() - 1),
      ...body.sessions.map(s => new Date(s.endAt)),
    ];
    await this.days.recompute(userId, await this.days.daysOf(userId, moments));
    await this.notifyReactions(userId).catch(error =>
      this.logger.warn(
        `Reactions not told: ${error instanceof Error ? error.message : error}`,
      ),
    );
    return {
      saved:
        body.minutes.length +
        body.hours.length +
        body.points.length +
        body.sessions.length,
    };
  }

  /** Health → Band: a day by hours, its night and its reactions. */
  async day(userId: string, day: LocalDate): Promise<BandDayDetail> {
    const zone = await this.days.timeZone(userId);
    const {start, end} = dayBounds(day, zone);
    const [minutes, hours, stress, sessions, reactions, points, history] =
      await Promise.all([
        this.db
          .select()
          .from(healthBandMinutes)
          .where(
            and(
              eq(healthBandMinutes.userId, userId),
              gte(healthBandMinutes.at, start),
              lt(healthBandMinutes.at, end),
            ),
          )
          .orderBy(asc(healthBandMinutes.at)),
        this.db
          .select()
          .from(healthBandHours)
          .where(
            and(
              eq(healthBandHours.userId, userId),
              gte(healthBandHours.at, start),
              lt(healthBandHours.at, end),
            ),
          )
          .orderBy(asc(healthBandHours.at)),
        this.db
          .select()
          .from(healthBandStressHours)
          .where(
            and(
              eq(healthBandStressHours.userId, userId),
              gte(healthBandStressHours.at, start),
              lt(healthBandStressHours.at, end),
            ),
          ),
        this.db
          .select()
          .from(healthBandSessions)
          .where(
            and(
              eq(healthBandSessions.userId, userId),
              lt(healthBandSessions.startAt, end),
              gt(
                healthBandSessions.endAt,
                new Date(start.getTime() - 18 * 3600_000),
              ),
            ),
          )
          .orderBy(asc(healthBandSessions.startAt)),
        this.db
          .select()
          .from(healthBandReactions)
          .where(
            and(
              eq(healthBandReactions.userId, userId),
              gte(healthBandReactions.startAt, start),
              lt(healthBandReactions.startAt, end),
            ),
          )
          .orderBy(asc(healthBandReactions.startAt)),
        this.db
          .select()
          .from(healthBandPoints)
          .where(
            and(
              eq(healthBandPoints.userId, userId),
              gte(
                healthBandPoints.at,
                new Date(start.getTime() - 18 * 3600_000),
              ),
              lt(healthBandPoints.at, end),
            ),
          )
          .orderBy(asc(healthBandPoints.at)),
        this.days.history(userId, day),
      ]);
    const ofDay = (at: Date) => at >= start && at < end;
    const night = sessions
      .filter(s => s.kind === 'sleep' && ofDay(s.endAt))
      .sort((a, b) => length(b) - length(a))[0];
    const stressAt = new Map(stress.map(h => [h.at.getTime(), h.score]));
    // The hours of the day: those with activity, and those with only an index.
    const hourMoments = [
      ...new Set([...hours.map(h => h.at.getTime()), ...stressAt.keys()]),
    ].sort((a, b) => a - b);
    const hourRows = new Map(hours.map(h => [h.at.getTime(), h]));
    const known = (values: (number | null)[]) =>
      values.filter((v): v is number => v !== null);
    return {
      day,
      minutes: minutes.map(m => ({
        at: m.at.toISOString(),
        bpm: m.bpm,
        steps: m.steps,
      })),
      hours: hourMoments.map(at => ({
        at: new Date(at).toISOString(),
        steps: hourRows.get(at)?.steps ?? null,
        calories: hourRows.get(at)?.calories ?? null,
        stress: stressAt.get(at) ?? null,
      })),
      sleep: night
        ? {
            startAt: night.startAt.toISOString(),
            endAt: night.endAt.toISOString(),
            stages: night.stages,
          }
        : null,
      exercises: sessions
        .filter(s => s.kind === 'exercise' && ofDay(s.startAt))
        .map(toSession),
      mindfulness: sessions
        .filter(s => s.kind === 'mindfulness' && ofDay(s.startAt))
        .map(toSession),
      reactions: reactions.map(r => ({
        id: r.id,
        startAt: r.startAt.toISOString(),
        endAt: r.endAt.toISOString(),
        peakBpm: r.peakBpm,
        baselineBpm: r.baselineBpm,
        score: r.score,
        feeling: r.feeling,
      })),
      points: points
        .filter(
          p =>
            ofDay(p.at) ||
            (night && p.at >= night.startAt && p.at <= night.endAt),
        )
        .map(p => ({kind: p.kind, at: p.at.toISOString(), value: p.value})),
      baseline: {
        restingHeartRate: median(known(history.map(h => h.restingHeartRate))),
        hrvMs: median(known(history.map(h => h.hrvMs))),
        sleepMinutes: median(known(history.map(h => h.sleepMinutes))),
      },
    };
  }

  async setFeeling(
    userId: string,
    id: string,
    feeling: ReactionFeeling,
  ): Promise<void> {
    const [updated] = await this.db
      .update(healthBandReactions)
      .set({feeling})
      .where(
        and(
          eq(healthBandReactions.id, id),
          eq(healthBandReactions.userId, userId),
        ),
      )
      .returning({id: healthBandReactions.id});
    if (!updated) {
      throw new NotFoundException();
    }
  }

  /** A breathing session done in the dashboard: it counts toward the day's mindfulness. */
  async addMindfulness(userId: string, input: MindfulnessInput): Promise<void> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(startAt.getTime() + input.minutes * 60_000);
    await this.db
      .insert(healthBandSessions)
      .values({
        userId,
        kind: 'mindfulness',
        startAt,
        endAt,
        source: 'dashboard',
      })
      .onConflictDoUpdate({
        target: [
          healthBandSessions.userId,
          healthBandSessions.kind,
          healthBandSessions.startAt,
        ],
        set: {endAt, source: 'dashboard'},
      });
    await this.days.recompute(
      userId,
      await this.days.daysOf(userId, [startAt]),
    );
  }

  async removeMindfulness(userId: string, id: string): Promise<void> {
    const [removed] = await this.db
      .delete(healthBandSessions)
      .where(
        and(
          eq(healthBandSessions.id, id),
          eq(healthBandSessions.userId, userId),
          eq(healthBandSessions.source, 'dashboard'),
        ),
      )
      .returning({startAt: healthBandSessions.startAt});
    if (!removed) {
      throw new NotFoundException();
    }
    await this.days.recompute(
      userId,
      await this.days.daysOf(userId, [removed.startAt]),
    );
  }

  /**
   * The newest fresh reaction is told with buttons to say what it was — in the quiet hours too,
   * at most once in NOTIFY_EVERY_MINUTES; the others of the same upload are only marked.
   */
  private async notifyReactions(userId: string): Promise<void> {
    const fresh = await this.days.unnotified(userId, NOTIFY_WITHIN_MS);
    const last = fresh[fresh.length - 1];
    if (!last) {
      return;
    }
    await this.days.markNotified(fresh.map(r => r.id));
    const user = await this.days.user(userId);
    const text = bandMessages(user?.locale);
    const zone = await this.days.timeZone(userId);
    const day = zonedDateTime(last.startAt, zone);
    await this.notifications.send(userId, {
      title: text.reaction.title,
      body: text.reaction.body(
        day.time,
        last.peakBpm,
        last.baselineBpm,
        Math.round((last.endAt.getTime() - last.startAt.getTime()) / 60_000),
      ),
      source: 'health',
      link: `/health/band?day=${day.date}`,
      now: true,
      dedupe: {key: 'health.band.reaction', minutes: NOTIFY_EVERY_MINUTES},
      // Six answers: more than the phone's shade shows, so a tap opens the card with them.
      actions: REACTION_FEELINGS.map(feeling => ({
        label: text.feelings[feeling],
        action: `${ACTION}:f:${last.id}:${feeling}`,
      })),
    });
  }

  /** A button of the notification: `f:<id>:<feeling>`. */
  private async answer(user: UserRow, payload: string): Promise<string> {
    const text = bandMessages(user.locale);
    const [, id, feeling] = payload.split(':');
    if (!REACTION_FEELINGS.includes(feeling as ReactionFeeling)) {
      return text.gone;
    }
    try {
      await this.setFeeling(user.id, id, feeling as ReactionFeeling);
    } catch {
      return text.gone;
    }
    return text.saved(text.feelings[feeling as ReactionFeeling]);
  }
}

const length = (s: SessionRow) => s.endAt.getTime() - s.startAt.getTime();

function toSession(s: SessionRow): BandSession {
  return {
    id: s.id,
    kind: s.kind,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    type: s.type,
    title: s.title,
    source: s.source,
  };
}
