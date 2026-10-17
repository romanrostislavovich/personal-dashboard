import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DB, Database, LinksService, Period } from '@pd/api-core';
import { DailyMetric, HealthRecord, healthConditions, TimelinePeriod } from '@pd/contracts';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { healthIntakes } from './health.schema';
import { HealthService } from './health.service';

/** The specialities whose treatment is of the mind: Psychology lays it over the mood. */
const MIND = new Set(['psychiatrist', 'psychotherapist']);

/**
 * What Health tells the other sections, for the links of Life and for Psychology:
 * - the periods of the history — every medication and every condition, those of the mind
 *   marked (`mind`: prescribed by a psychiatrist or a psychotherapist, ICD-10 chapter F, ICD-11
 *   chapter 6): Psychology lays those over the mood, "before and after" takes them all;
 * - daily numbers: the share of the medication reminders taken, the visits to doctors, and the
 *   results of the lab tests (each analyte a reading of its own, in its canonical unit);
 * - its pages for the assistant.
 * The texts of the visits and the documents never leave the section.
 */
@Injectable()
export class HealthLinks implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly links: LinksService,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    this.links.registerPeriods({
      module: 'health',
      periods: async (userId, range) => healthPeriods(await this.health.record(userId), range),
    });
    this.links.registerDailyMetrics({
      module: 'health',
      metrics: async (userId, period) => {
        const record = await this.health.record(userId);
        return [
          await this.intakes(userId, period),
          visitsMetric(record, period),
          ...labMetrics(record, period),
        ].filter((metric): metric is DailyMetric => !!metric && metric.days.length > 0);
      },
    });
    this.links.registerPages([
      { module: 'health', path: '/health/history', description: 'medical visits, documents' },
      { module: 'health', path: '/health/conditions', description: 'diagnoses over the years' },
      { module: 'health', path: '/health/results', description: 'lab results and studies' },
      { module: 'health', path: '/health/medications', description: 'medications' },
      { module: 'health', path: '/health/summary', description: 'a summary for a new doctor' },
    ]);
  }

  /** The share of the day's reminders to take a medication that were taken (answered ones). */
  private async intakes(userId: string, period: Period): Promise<DailyMetric> {
    const i = healthIntakes;
    const rows = await this.db
      .select({
        day: i.day,
        taken: sql<number>`count(*) filter (where ${i.status} = 'taken')::int`,
        answered: sql<number>`count(*) filter (where ${i.status} <> 'pending')::int`,
      })
      .from(i)
      .where(and(eq(i.userId, userId), gte(i.day, period.from), lte(i.day, period.to)))
      .groupBy(i.day);
    return {
      key: 'health.intakes',
      module: 'health',
      labelKey: 'health.links.intakes',
      unit: 'percent',
      days: rows
        .filter((row) => row.answered > 0)
        .map((row) => ({ day: row.day, value: Math.round((row.taken / row.answered) * 100) })),
    };
  }
}

/** The periods of the history that touch the range, those of the mind marked. */
export function healthPeriods(
  record: HealthRecord,
  range: Period,
): Omit<TimelinePeriod, 'module'>[] {
  const mindVisits = new Set(
    record.visits.filter((v) => v.speciality && MIND.has(v.speciality)).map((v) => v.id),
  );
  const medications = record.medications
    .filter((m) => m.startedOn)
    .map((m) => ({
      kind: 'medication',
      title: m.name,
      subtitle: [m.dose, m.schedule].filter(Boolean).join(', ') || null,
      from: m.startedOn as string,
      to: m.stoppedOn,
      mind: !!m.visitId && mindVisits.has(m.visitId),
    }));
  const conditions = healthConditions(record.diagnoses)
    .filter((c) => c.status !== 'ruledOut')
    .map((c) => ({
      kind: 'diagnosis',
      title: c.code ? `${c.code} ${c.title}` : c.title,
      subtitle: null,
      from: c.firstOn,
      // In remission or taken off — over at its last diagnosis; otherwise still going on.
      to: c.status === 'remission' || c.status === 'resolved' ? c.lastOn : null,
      mind: isMind(c.system, c.code),
    }));
  return [...medications, ...conditions].filter(
    (period) => period.from <= range.to && (period.to === null || period.to >= range.from),
  );
}

/** The visits to doctors of every day. */
export function visitsMetric(record: HealthRecord, range: Period): DailyMetric {
  const days = new Map<string, number>();
  for (const visit of record.visits) {
    if (visit.visitedOn >= range.from && visit.visitedOn <= range.to) {
      days.set(visit.visitedOn, (days.get(visit.visitedOn) ?? 0) + 1);
    }
  }
  return {
    key: 'health.visits',
    module: 'health',
    labelKey: 'health.links.visits',
    unit: 'count',
    days: [...days].map(([day, value]) => ({ day, value })),
  };
}

/**
 * Every analyte of the lab tests as a reading on the days it was taken: in its canonical unit
 * when it has one (so results of two laboratories compare), as written otherwise.
 */
export function labMetrics(record: HealthRecord, range: Period): DailyMetric[] {
  const analytes = new Map<string, { label: string; days: Map<string, number> }>();
  for (const panel of record.labPanels) {
    if (panel.takenOn < range.from || panel.takenOn > range.to) {
      continue;
    }
    for (const value of panel.values) {
      const number = value.canonical?.value ?? value.value;
      if (number === null) {
        continue;
      }
      const unit = value.canonical?.unit ?? value.unit;
      const id = (value.analyte ?? value.name).toLowerCase();
      const key = `${id}|${unit ?? ''}`;
      const found = analytes.get(key) ?? {
        label: unit ? `${value.name} (${unit})` : value.name,
        days: new Map<string, number>(),
      };
      found.days.set(panel.takenOn, number);
      analytes.set(key, found);
    }
  }
  return [...analytes].map(([key, { label, days }]) => ({
    key: `health.lab.${key}`,
    module: 'health',
    labelKey: 'health.links.lab',
    label,
    unit: 'score' as const,
    days: [...days].map(([day, value]) => ({ day, value })),
  }));
}

function isMind(system: string, code: string | null): boolean {
  if (!code) {
    return false;
  }
  return system === 'icd11' ? code.startsWith('6') : code.startsWith('F');
}
