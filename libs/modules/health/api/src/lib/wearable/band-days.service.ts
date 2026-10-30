import {Inject, Injectable} from '@nestjs/common';
import {DB, Database, UsersService} from '@pd/api-core';
import {LocalDate, WearableDay, zonedDateTime, zonedToUtc} from '@pd/contracts';
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
} from 'drizzle-orm';
import {
  combinedStress,
  dayStress,
  hourlyStress,
  lowestRollingMean,
  median,
  Minute,
  nightStress,
  reactions,
  resilience,
  restingHeartRate,
  restMinutes,
  sleepScore,
  Span,
  stageMinutes,
} from './band-math';
import {
  healthBandDays,
  healthBandHours,
  healthBandMinutes,
  healthBandPoints,
  healthBandReactions,
  healthBandSessions,
  healthBandStressHours,
} from './band.schema';
import {addDays, WearableService} from './wearable.service';

const HOUR = 3600_000;
/** The baselines are the owner's own of this many days before. */
export const BASELINE_DAYS = 28;

/** A day of the owner's time zone as moments: [start, end). */
export interface DayBounds {
  day: LocalDate;
  start: Date;
  end: Date;
}

export function dayBounds(day: LocalDate, timeZone: string): DayBounds {
  return {
    day,
    start: zonedToUtc({date: day, time: '00:00'}, timeZone),
    end: zonedToUtc({date: addDays(day, 1), time: '00:00'}, timeZone),
  };
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = (value: number | null, digits = 0) =>
  value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits;
const clock = (at: Date, timeZone: string) => zonedDateTime(at, timeZone).time;

/**
 * Counts a day from the band's minutes, hours, points and sessions (band-math.ts) and keeps it:
 * the day's row, the stress of its hours, the body's reactions. Run after every upload of the
 * phone for the days it touched; a day counted again gives the same result.
 */
@Injectable()
export class BandDaysService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UsersService,
    private readonly wearable: WearableService,
  ) {}

  user(userId: string) {
    return this.users.findById(userId);
  }

  async timeZone(userId: string): Promise<string> {
    return this.users.timeZoneOf(await this.users.findById(userId));
  }

  /** The local days the moments fall on (and every day between). */
  async daysOf(userId: string, moments: Date[]): Promise<LocalDate[]> {
    if (!moments.length) {
      return [];
    }
    const zone = await this.timeZone(userId);
    const sorted = moments.map(m => zonedDateTime(m, zone).date).sort();
    const days: LocalDate[] = [];
    for (
      let day = sorted[0];
      day <= sorted[sorted.length - 1];
      day = addDays(day, 1)
    ) {
      days.push(day);
    }
    return days;
  }

  async recompute(userId: string, days: LocalDate[]): Promise<void> {
    const zone = await this.timeZone(userId);
    for (const day of [...new Set(days)].sort()) {
      await this.recomputeDay(userId, dayBounds(day, zone), zone);
    }
  }

  /** The owner's merged days before `day` — the baselines. */
  async history(userId: string, day: LocalDate): Promise<WearableDay[]> {
    return this.wearable.days(userId, {
      from: addDays(day, -BASELINE_DAYS),
      to: addDays(day, -1),
    });
  }

  private async recomputeDay(
    userId: string,
    bounds: DayBounds,
    zone: string,
  ): Promise<void> {
    const {day, start, end} = bounds;
    const {minuteRows, hours, sessions, points} = await this.loadDay(
      userId,
      bounds,
    );
    const minutes: Minute[] = minuteRows.map(m => ({
      at: m.at.getTime(),
      bpm: m.bpm,
      steps: m.steps,
    }));
    const ofDay = (at: Date) => at >= start && at < end;
    const sleeps = sessions.filter(s => s.kind === 'sleep');
    const night = sleeps
      .filter(s => ofDay(s.endAt))
      .sort(
        (a, b) =>
          b.endAt.getTime() -
          b.startAt.getTime() -
          (a.endAt.getTime() - a.startAt.getTime()),
      )[0];
    const spans = (kind: string): Span[] =>
      sessions
        .filter(s => s.kind === kind)
        .map(s => ({start: s.startAt.getTime(), end: s.endAt.getTime()}));
    const dayMinutes = minutes.filter(m => m.at >= start.getTime());
    const rest = restMinutes(minutes, spans('exercise'), spans('sleep')).filter(
      m => m.at >= start.getTime(),
    );
    const nightSpan = night ? {start: night.startAt, end: night.endAt} : null;
    const sleepMinutes = nightSpan
      ? await this.minutesBetween(userId, nightSpan.start, nightSpan.end)
      : [];
    const inNight = (at: Date) =>
      !!nightSpan && at >= nightSpan.start && at <= nightSpan.end;

    const history = await this.history(userId, day);
    const values = (key: keyof WearableDay) =>
      history
        .map(h => h[key])
        .filter((v): v is number => typeof v === 'number');
    const told = (kind: string, where: (at: Date) => boolean) =>
      mean(
        points.filter(p => p.kind === kind && where(p.at)).map(p => p.value),
      );

    const resting =
      round(told('restingHr', ofDay)) ?? restingHeartRate(sleepMinutes, rest);
    const hrv = round(told('hrv', nightSpan ? inNight : ofDay), 1);
    const stages = night
      ? stageMinutes(
          night.stages.map(s => ({
            start: Date.parse(s.startAt),
            end: Date.parse(s.endAt),
            stage: s.stage,
          })),
        )
      : null;
    // The pulse at rest while awake: the day's own, and the owner's usual one (the stress index's
    // baseline) — the days before, else this day's.
    const wakingRest = median(
      rest.map(m => m.bpm as number),
      60,
    );
    const awakeBase =
      median(await this.restBpmBefore(userId, day)) ?? wakingRest;

    const stressHours = awakeBase === null ? [] : hourlyStress(rest, awakeBase);
    await this.saveStressHours(userId, bounds, stressHours);
    const found = awakeBase === null ? [] : reactions(rest, awakeBase);
    await this.saveReactions(userId, bounds, found, awakeBase ?? 0);

    const daytime = dayStress(stressHours);
    const nightIndex = nightStress(hrv, resting, {
      hrv: values('hrvMs'),
      resting: values('restingHeartRate'),
    });
    const score = stages
      ? sleepScore(
          stages,
          lowestRollingMean(sleepMinutes, 30),
          wakingRest ?? awakeBase,
        )
      : null;
    const mindful = sessions
      .filter(s => s.kind === 'mindfulness' && ofDay(s.startAt))
      .reduce(
        (total, s) =>
          total + (s.endAt.getTime() - s.startAt.getTime()) / 60_000,
        0,
      );
    const skin = round(
      told('skinTemp', at =>
        nightSpan
          ? at >= nightSpan.start &&
            at <= new Date(nightSpan.end.getTime() + 3 * HOUR)
          : ofDay(at),
      ),
      2,
    );

    if (
      !dayMinutes.length &&
      !hours.length &&
      !night &&
      !mindful &&
      skin === null
    ) {
      await this.db
        .delete(healthBandDays)
        .where(
          and(eq(healthBandDays.userId, userId), eq(healthBandDays.day, day)),
        );
      return;
    }
    const row = {
      ...activityTotals(
        hours,
        minuteRows.filter(m => ofDay(m.at)),
      ),
      restingHeartRate: resting,
      hrvMs: hrv,
      ...nightFields(night, stages, zone),
      sleepScore: score,
      stressScore: combinedStress(daytime, nightIndex),
      resilience: resilience(score, nightIndex, daytime),
      reactions: awakeBase === null ? null : found.length,
      restBpm: round(wakingRest),
      mindfulnessMinutes: mindful ? Math.round(mindful) : null,
      skinTempDelta: skin,
    };
    await this.db
      .insert(healthBandDays)
      .values({userId, day, ...row})
      .onConflictDoUpdate({
        target: [healthBandDays.userId, healthBandDays.day],
        set: row,
      });
  }

  /** The rows a day is counted from, with the hours before it that it needs. */
  private async loadDay(userId: string, {start, end}: DayBounds) {
    // The minutes before the day tell whether its first minutes are at rest.
    const minuteRows = await this.db
      .select()
      .from(healthBandMinutes)
      .where(
        and(
          eq(healthBandMinutes.userId, userId),
          gte(healthBandMinutes.at, new Date(start.getTime() - 10 * 60_000)),
          lt(healthBandMinutes.at, end),
        ),
      )
      .orderBy(asc(healthBandMinutes.at));
    const hours = await this.db
      .select()
      .from(healthBandHours)
      .where(
        and(
          eq(healthBandHours.userId, userId),
          gte(healthBandHours.at, start),
          lt(healthBandHours.at, end),
        ),
      );
    // A night that ends this day began the evening before.
    const sessions = await this.db
      .select()
      .from(healthBandSessions)
      .where(
        and(
          eq(healthBandSessions.userId, userId),
          lt(healthBandSessions.startAt, end),
          gt(healthBandSessions.endAt, new Date(start.getTime() - 18 * HOUR)),
        ),
      );
    const points = await this.db
      .select()
      .from(healthBandPoints)
      .where(
        and(
          eq(healthBandPoints.userId, userId),
          gte(healthBandPoints.at, new Date(start.getTime() - 18 * HOUR)),
          lt(healthBandPoints.at, end),
        ),
      );

    return {minuteRows, hours, sessions, points};
  }

  /** The day's hours of stress as counted now, in place of the ones before. */
  private async saveStressHours(
    userId: string,
    {start, end}: DayBounds,
    stressHours: ReturnType<typeof hourlyStress>,
  ): Promise<void> {
    await this.db.transaction(async tx => {
      await tx
        .delete(healthBandStressHours)
        .where(
          and(
            eq(healthBandStressHours.userId, userId),
            gte(healthBandStressHours.at, start),
            lt(healthBandStressHours.at, end),
          ),
        );
      if (stressHours.length) {
        await tx.insert(healthBandStressHours).values(
          stressHours.map(h => ({
            userId,
            at: new Date(h.at),
            score: h.score,
            restMinutes: h.restMinutes,
          })),
        );
      }
    });
  }

  /** The pulse at rest while awake of the BASELINE_DAYS before `day`. */
  private async restBpmBefore(
    userId: string,
    day: LocalDate,
  ): Promise<number[]> {
    const b = healthBandDays;
    const rows = await this.db
      .select({restBpm: b.restBpm})
      .from(b)
      .where(
        and(
          eq(b.userId, userId),
          gte(b.day, addDays(day, -BASELINE_DAYS)),
          lt(b.day, day),
          isNotNull(b.restBpm),
        ),
      );
    return rows.map(row => row.restBpm as number);
  }

  private async minutesBetween(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Minute[]> {
    const rows = await this.db
      .select()
      .from(healthBandMinutes)
      .where(
        and(
          eq(healthBandMinutes.userId, userId),
          gte(healthBandMinutes.at, from),
          lt(healthBandMinutes.at, to),
        ),
      )
      .orderBy(asc(healthBandMinutes.at));
    return rows.map(m => ({at: m.at.getTime(), bpm: m.bpm, steps: m.steps}));
  }

  /**
   * The day's reactions as found now: a reaction found again keeps its id, its feeling and its
   * notification; one no longer found goes unless the owner said what it was.
   */
  private async saveReactions(
    userId: string,
    {start, end}: DayBounds,
    found: ReturnType<typeof reactions>,
    baseline: number,
  ): Promise<void> {
    const r = healthBandReactions;
    const starts = found.map(one => new Date(one.start));
    await this.db
      .delete(r)
      .where(
        and(
          eq(r.userId, userId),
          gte(r.startAt, start),
          lt(r.startAt, end),
          isNull(r.feeling),
          ...(starts.length ? [notInArray(r.startAt, starts)] : []),
        ),
      );
    for (const one of found) {
      const values = {
        endAt: new Date(one.end),
        peakBpm: one.peakBpm,
        baselineBpm: Math.round(baseline),
        score: one.score,
      };
      await this.db
        .insert(r)
        .values({userId, startAt: new Date(one.start), ...values})
        .onConflictDoUpdate({target: [r.userId, r.startAt], set: values});
    }
  }

  /** The reactions not told about yet that ended within `withinMs`. */
  async unnotified(userId: string, withinMs: number) {
    const r = healthBandReactions;
    return this.db
      .select()
      .from(r)
      .where(
        and(
          eq(r.userId, userId),
          isNull(r.notifiedAt),
          gte(r.endAt, new Date(Date.now() - withinMs)),
        ),
      )
      .orderBy(asc(r.startAt));
  }

  async markNotified(ids: string[]): Promise<void> {
    if (ids.length) {
      await this.db
        .update(healthBandReactions)
        .set({notifiedAt: new Date()})
        .where(inArray(healthBandReactions.id, ids));
    }
  }
}

type HourRow = typeof healthBandHours.$inferSelect;
type MinuteRow = typeof healthBandMinutes.$inferSelect;
type SessionRow = typeof healthBandSessions.$inferSelect;

/** The day's steps, calories and distance by its hours, its pulse by its minutes. */
function activityTotals(hours: HourRow[], minutes: MinuteRow[]) {
  const sum = (key: 'steps' | 'calories' | 'distanceM') => {
    const known = hours.map(h => h[key]).filter((v): v is number => v !== null);
    return known.length ? known.reduce((a, b) => a + b, 0) : null;
  };
  const distance = sum('distanceM');
  const bpms = minutes.map(m => m.bpm).filter((v): v is number => v !== null);
  const maxes = minutes
    .map(m => m.bpmMax ?? m.bpm)
    .filter((v): v is number => v !== null);
  return {
    steps: round(sum('steps')),
    calories: round(sum('calories')),
    distanceKm: round(distance === null ? null : distance / 1000, 2),
    heartRateAvg: round(mean(bpms)),
    heartRateMax: maxes.length ? Math.round(Math.max(...maxes)) : null,
  };
}

/** The night that ended the day: its stages in minutes and its clock times. */
function nightFields(
  night: SessionRow | undefined,
  stages: ReturnType<typeof stageMinutes> | null,
  zone: string,
) {
  if (!night || !stages) {
    return {
      sleepMinutes: null,
      deepMinutes: null,
      remMinutes: null,
      lightMinutes: null,
      awakeMinutes: null,
      sleepStart: night ? clock(night.startAt, zone) : null,
      sleepEnd: night ? clock(night.endAt, zone) : null,
    };
  }
  return {
    sleepMinutes: stages.asleep,
    deepMinutes: stages.deep || null,
    remMinutes: stages.rem || null,
    lightMinutes: stages.light || null,
    awakeMinutes: stages.awake,
    sleepStart: clock(night.startAt, zone),
    sleepEnd: clock(night.endAt, zone),
  };
}
