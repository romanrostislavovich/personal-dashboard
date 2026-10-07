import { Inject, Injectable } from '@nestjs/common';
import {
  AutomationsService,
  DB,
  Database,
  LinksService,
  NotificationsService,
  ProjectsService,
  UsersService,
} from '@pd/api-core';
import {
  ActivityComputer,
  ActivityFocusSessionInput,
  ActivityFocusStats,
  ActivityHealthInput,
  ActivityLimit,
  ActivityLimitInput,
  ActivityOutage,
  ActivityPeriod,
  addDays,
  LocalDate,
  parseLocalDate,
  toLocalDate,
  zonedToUtc,
} from '@pd/contracts';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { categoryOf, longestRun } from './activity-stats';
import { activityMessages } from './activity.messages';
import {
  activityDevices,
  ActivityDeviceRow,
  activityFocusSessions,
  activityHealth,
  activityLimits,
  activityOutages,
  activitySpans,
} from './activity.schema';
import { ActivityService } from './activity.service';
import {
  alertKey,
  BatteryWeek,
  buildFocusStats,
  computerWarnings,
  ComputerWarning,
  reachedLimits,
} from './wellbeing-rules';

/** Health snapshots older than this are deleted (activity.jobs.ts). */
export const HEALTH_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What looks after the user rather than counts time: focus sessions (Pomodoro), daily limits
 * and the health of the computers. Trackers report focus sessions and health along with their
 * spans; limits are checked here on every upload, so they add up all devices together.
 */
@Injectable()
export class WellbeingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly projects: ProjectsService,
    private readonly users: UsersService,
    private readonly automations: AutomationsService,
    private readonly links: LinksService,
  ) {}

  // --- Focus sessions ---

  async saveFocus(device: ActivityDeviceRow, sessions: ActivityFocusSessionInput[]): Promise<void> {
    if (!sessions.length) {
      return;
    }
    // A project of somebody else is not linked: the session stays, without it.
    const own = new Set((await this.projects.list(device.userId)).map((project) => project.id));
    await this.db
      .insert(activityFocusSessions)
      .values(
        sessions.map((session) => ({
          id: session.id,
          userId: device.userId,
          deviceId: device.id,
          projectId: session.projectId && own.has(session.projectId) ? session.projectId : null,
          note: session.note,
          startedAt: new Date(session.startedAt),
          endedAt: new Date(session.endedAt),
          plannedMinutes: session.plannedMinutes,
          focusSeconds: session.focusSeconds,
          completed: session.completed,
          distractions: session.distractions,
        })),
      )
      .onConflictDoNothing();
  }

  async focusStats(userId: string, period: ActivityPeriod): Promise<ActivityFocusStats> {
    const timeZone = await this.activity.timeZone(userId);
    const s = activityFocusSessions;
    const after = toLocalDate(addDays(parseLocalDate(period.to), 1));
    const rows = await this.db
      .select()
      .from(s)
      .where(
        and(
          eq(s.userId, userId),
          gte(s.startedAt, zonedToUtc({ date: period.from, time: '00:00' }, timeZone)),
          lt(s.startedAt, zonedToUtc({ date: after, time: '00:00' }, timeZone)),
          period.deviceId ? eq(s.deviceId, period.deviceId) : undefined,
        ),
      )
      .orderBy(desc(s.startedAt));
    const names = new Map(
      (await this.projects.list(userId)).map((project) => [project.id, project.name]),
    );
    const dayOf = (at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
    const distracted = (row: (typeof rows)[number]) =>
      row.distractions.reduce((sum, item) => sum + item.seconds, 0);

    return {
      ...buildFocusStats(
        rows.map((row) => ({
          day: dayOf(row.startedAt),
          projectId: row.projectId,
          projectName: row.projectId ? (names.get(row.projectId) ?? null) : null,
          focusSeconds: row.focusSeconds,
          completed: row.completed,
          distractedSeconds: distracted(row),
        })),
        period,
        await this.completedDays(userId),
        dayOf(new Date()),
      ),
      sessions: rows.map((row) => ({
        id: row.id,
        deviceId: row.deviceId,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        plannedMinutes: row.plannedMinutes,
        focusSeconds: row.focusSeconds,
        completed: row.completed,
        projectId: row.projectId,
        projectName: row.projectId ? (names.get(row.projectId) ?? null) : null,
        note: row.note,
        distractions: row.distractions,
      })),
    };
  }

  async removeFocus(userId: string, id: string): Promise<void> {
    await this.db
      .delete(activityFocusSessions)
      .where(and(eq(activityFocusSessions.id, id), eq(activityFocusSessions.userId, userId)));
  }

  /** Completed sessions, focus time and the longest run of days — for the achievements. */
  async focusRecords(
    userId: string,
  ): Promise<{ sessions: number; seconds: number; longestStreak: number }> {
    const s = activityFocusSessions;
    const [totals] = await this.db
      .select({
        sessions: sql<number>`count(*) filter (where ${s.completed})::int`,
        seconds: sql<number>`coalesce(sum(${s.focusSeconds}), 0)::int`,
      })
      .from(s)
      .where(eq(s.userId, userId));
    return {
      sessions: totals?.sessions ?? 0,
      seconds: totals?.seconds ?? 0,
      longestStreak: longestRun(await this.completedDays(userId)),
    };
  }

  /** The user's own days with a completed session. */
  private async completedDays(userId: string): Promise<LocalDate[]> {
    const timeZone = await this.activity.timeZone(userId);
    const s = activityFocusSessions;
    const rows = await this.db
      .selectDistinct({
        day: sql<LocalDate>`to_char(${s.startedAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
      })
      .from(s)
      .where(and(eq(s.userId, userId), eq(s.completed, true)));
    return rows.map((row) => row.day);
  }

  // --- Daily limits ---

  async limits(userId: string): Promise<ActivityLimit[]> {
    const rows = await this.db
      .select()
      .from(activityLimits)
      .where(eq(activityLimits.userId, userId))
      .orderBy(asc(activityLimits.kind), asc(activityLimits.app));
    return rows.map(({ id, kind, app, minutes }) => ({ id, kind, app, minutes }));
  }

  /** The whole set at once; a limit that stays keeps its "reported today". */
  async saveLimits(userId: string, limits: ActivityLimitInput[]): Promise<void> {
    const key = (limit: { kind: string; app: string | null }) => `${limit.kind}:${limit.app ?? ''}`;
    const unique = [...new Map(limits.map((limit) => [key(limit), limit])).values()];
    await this.db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(activityLimits)
        .where(eq(activityLimits.userId, userId));
      const wanted = new Map(unique.map((limit) => [key(limit), limit]));
      const gone = existing.filter((row) => !wanted.has(key(row))).map((row) => row.id);
      if (gone.length) {
        await tx.delete(activityLimits).where(inArray(activityLimits.id, gone));
      }
      for (const limit of unique) {
        const row = existing.find((candidate) => key(candidate) === key(limit));
        if (row) {
          if (row.minutes !== limit.minutes) {
            await tx
              .update(activityLimits)
              .set({ minutes: limit.minutes })
              .where(eq(activityLimits.id, row.id));
          }
        } else {
          await tx.insert(activityLimits).values({ userId, ...limit });
        }
      }
    });
  }

  /** After an upload: tells about the limits reached today on all devices together. */
  async checkLimits(userId: string): Promise<void> {
    const limits = await this.db
      .select()
      .from(activityLimits)
      .where(eq(activityLimits.userId, userId));
    if (!limits.length) {
      return;
    }
    const timeZone = await this.activity.timeZone(userId);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    const rows = await this.db
      .select({
        app: activitySpans.app,
        appName: sql<string>`max(${activitySpans.appName})`,
        seconds: sql<number>`sum(${activitySpans.seconds})::int`,
      })
      .from(activitySpans)
      .where(
        and(
          eq(activitySpans.userId, userId),
          gte(activitySpans.startedAt, zonedToUtc({ date: day, time: '00:00' }, timeZone)),
        ),
      )
      .groupBy(activitySpans.app);
    const categories = await this.activity.chosenCategories(userId);
    const reached = reachedLimits(
      limits,
      new Map(rows.map((row) => [row.app, row.seconds])),
      (app) => categoryOf(app, categories),
      day,
      await this.gamesBonusMinutes(userId, day),
    );
    if (!reached.length) {
      return;
    }
    const text = activityMessages((await this.users.findById(userId))?.locale);
    const names = new Map(rows.map((row) => [row.app, row.appName]));
    for (const { limit, usedSeconds } of reached) {
      const limitSeconds = limit.minutes * 60;
      await this.notifications.send(userId, {
        title: text.limitTitle,
        body:
          limit.kind === 'games'
            ? text.limitGames(usedSeconds, limitSeconds)
            : limit.kind === 'total'
              ? text.limitTotal(usedSeconds, limitSeconds)
              : text.limitApp(
                  names.get(limit.app ?? '') ?? limit.app ?? '',
                  usedSeconds,
                  limitSeconds,
                ),
        source: 'activity',
      });
      await this.automations.emit(userId, 'activity.limit', {
        what: limit.kind === 'app' ? (names.get(limit.app ?? '') ?? limit.app ?? '') : limit.kind,
        minutes: String(limit.minutes),
      });
      await this.db
        .update(activityLimits)
        .set({ notifiedOn: day })
        .where(eq(activityLimits.id, limit.id));
    }
  }

  /** Minutes the tasks done today add to the limit of games (see `gamesMinutesPerTask`). */
  private async gamesBonusMinutes(userId: string, day: LocalDate): Promise<number> {
    const { gamesMinutesPerTask } = await this.activity.settings(userId);
    if (!gamesMinutesPerTask) {
      return 0;
    }
    // The tasks are another section's: the core tells how many were done today.
    const done = await this.links.dailyMetric(userId, 'tasks.done', { from: day, to: day });
    return (done?.days[0]?.value ?? 0) * gamesMinutesPerTask;
  }

  // --- Health of the computers ---

  async saveHealth(device: ActivityDeviceRow, health: ActivityHealthInput): Promise<void> {
    const recent = await this.db
      .select({ system: activityHealth.system })
      .from(activityHealth)
      .where(eq(activityHealth.deviceId, device.id))
      .orderBy(desc(activityHealth.at))
      .limit(2);
    await this.db
      .insert(activityHealth)
      .values({
        userId: device.userId,
        deviceId: device.id,
        at: new Date(health.at),
        cpu: health.cpu,
        memoryUsed: health.memoryUsed,
        memoryTotal: health.memoryTotal,
        uptimeSeconds: health.uptimeSeconds,
        disks: health.disks,
        system: health.system ?? null,
      })
      .onConflictDoNothing();

    const timeZone = await this.activity.timeZone(device.userId);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
    const warnings = computerWarnings(
      health,
      recent.map((row) => row.system),
      device.alertedOn,
      day,
      health.system?.battery ? await this.batteryWeek(device.id) : null,
    );
    if (!warnings.length) {
      return;
    }
    const text = activityMessages((await this.users.findById(device.userId))?.locale);
    for (const warning of warnings) {
      const message = this.warningText(text, device.name, warning);
      await this.notifications.send(device.userId, { ...message, source: 'activity' });
    }
    const alertedOn = { ...device.alertedOn };
    for (const warning of warnings) {
      alertedOn[alertKey(warning)] = day;
    }
    await this.db
      .update(activityDevices)
      .set({ alertedOn })
      .where(eq(activityDevices.id, device.id));
  }

  private warningText(
    text: ReturnType<typeof activityMessages>,
    computer: string,
    warning: ComputerWarning,
  ): { title: string; body: string } {
    const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
    switch (warning.kind) {
      case 'disk':
        return {
          title: text.diskTitle(computer),
          body: text.diskBody(
            warning.disks
              .map((disk) => `${disk.mount} ${gb(disk.free)} ${text.gigabytes}`)
              .join(', '),
          ),
        };
      case 'diskHealth':
        return {
          title: text.diskHealthTitle(computer),
          body: text.diskHealthBody(warning.disks.join(', ')),
        };
      case 'heat':
        return { title: text.heatTitle(computer), body: text.heatBody };
      case 'reboot':
        return { title: text.rebootTitle(computer), body: text.rebootBody(warning.days) };
      case 'batteryFull':
        return { title: text.batteryFullTitle(computer), body: text.batteryFullBody };
      case 'batteryHealth':
        return {
          title: text.batteryHealthTitle(computer),
          body: text.batteryHealthBody(warning.percent),
        };
    }
  }

  /** How often the battery sat full on mains power in the last week. */
  private async batteryWeek(deviceId: string): Promise<BatteryWeek> {
    const h = activityHealth;
    const [row] = await this.db
      .select({
        readings: sql<number>`count(*) filter (where ${h.system} -> 'battery' is not null)::int`,
        full: sql<number>`count(*) filter (where (${h.system} -> 'battery' ->> 'onAc')::boolean and (${h.system} -> 'battery' ->> 'charge')::int >= 98)::int`,
      })
      .from(h)
      .where(and(eq(h.deviceId, deviceId), gte(h.at, new Date(Date.now() - 7 * DAY_MS))));
    return { readings: row?.readings ?? 0, full: row?.full ?? 0 };
  }

  /** The times the computer could not reach the server, sent once it could again. */
  async saveOutages(device: ActivityDeviceRow, outages: ActivityOutage[]): Promise<void> {
    if (!outages.length) {
      return;
    }
    await this.db
      .insert(activityOutages)
      .values(
        outages.map((outage) => ({
          id: outage.id,
          userId: device.userId,
          deviceId: device.id,
          kind: outage.kind,
          startedAt: new Date(outage.startedAt),
          endedAt: new Date(outage.endedAt),
        })),
      )
      .onConflictDoNothing();
  }

  /** Every computer with its latest state and the last day of load and memory. */
  async computers(userId: string): Promise<ActivityComputer[]> {
    const devices = await this.db
      .select()
      .from(activityDevices)
      .where(eq(activityDevices.userId, userId))
      .orderBy(asc(activityDevices.name));
    const h = activityHealth;
    const rows = await this.db
      .select()
      .from(h)
      .where(and(eq(h.userId, userId), gte(h.at, new Date(Date.now() - DAY_MS))))
      .orderBy(asc(h.at));
    return Promise.all(
      devices.map(async (device) => {
        const history = rows.filter((row) => row.deviceId === device.id);
        const outages = await this.db
          .select({
            kind: activityOutages.kind,
            startedAt: activityOutages.startedAt,
            endedAt: activityOutages.endedAt,
          })
          .from(activityOutages)
          .where(
            and(
              eq(activityOutages.deviceId, device.id),
              gte(activityOutages.startedAt, new Date(Date.now() - 7 * DAY_MS)),
            ),
          )
          .orderBy(desc(activityOutages.startedAt));
        // A computer that was off all day still shows what it said last.
        const [last] = history.length
          ? [history[history.length - 1]]
          : await this.db
              .select()
              .from(h)
              .where(eq(h.deviceId, device.id))
              .orderBy(desc(h.at))
              .limit(1);
        return {
          deviceId: device.id,
          name: device.name,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          latest: last
            ? {
                at: last.at.toISOString(),
                cpu: last.cpu,
                memoryUsed: last.memoryUsed,
                memoryTotal: last.memoryTotal,
                uptimeSeconds: last.uptimeSeconds,
                disks: last.disks,
                ...(last.system ? { system: last.system } : {}),
              }
            : null,
          outages: outages.map((outage) => ({
            kind: outage.kind,
            startedAt: outage.startedAt.toISOString(),
            endedAt: outage.endedAt.toISOString(),
          })),
          history: history.map((row) => {
            const zones = row.system?.thermal ?? [];
            return {
              at: row.at.toISOString(),
              cpu: Math.round(row.cpu),
              memory: Math.round((row.memoryUsed / row.memoryTotal) * 100),
              gpu: row.system?.gpuLoad ?? null,
              celsius: zones.length ? Math.max(...zones.map((zone) => zone.celsius)) : null,
              battery: row.system?.battery?.charge ?? null,
            };
          }),
        };
      }),
    );
  }

  /** Called once a day: health is for the recent past, not forever. */
  async deleteOldHealth(): Promise<void> {
    const before = new Date(Date.now() - HEALTH_KEEP_DAYS * DAY_MS);
    await this.db.delete(activityHealth).where(lt(activityHealth.at, before));
    await this.db.delete(activityOutages).where(lt(activityOutages.startedAt, before));
  }
}
