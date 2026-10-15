import { Injectable, OnModuleInit } from '@nestjs/common';
import { LinksService, Period } from '@pd/api-core';
import { HealthRecord, healthConditions, TimelinePeriod } from '@pd/contracts';
import { HealthService } from './health.service';

/** The specialities whose treatment is told to Psychology, next to the mood. */
const MIND = new Set(['psychiatrist', 'psychotherapist']);

/**
 * What Health tells the other sections: the periods of mental-health treatment — medications
 * prescribed by a psychiatrist or a psychotherapist, conditions of the mind (ICD-10 chapter F,
 * ICD-11 chapter 6) — which Psychology lays over the mood; and its pages for the assistant.
 * Nothing else of the history leaves the section.
 */
@Injectable()
export class HealthLinks implements OnModuleInit {
  constructor(
    private readonly links: LinksService,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    this.links.registerPeriods({
      module: 'health',
      periods: async (userId, range) => mindPeriods(await this.health.record(userId), range),
    });
    this.links.registerPages([
      { module: 'health', path: '/health/history', description: 'medical visits, documents' },
      { module: 'health', path: '/health/conditions', description: 'diagnoses over the years' },
      { module: 'health', path: '/health/results', description: 'lab results and studies' },
      { module: 'health', path: '/health/medications', description: 'medications' },
      { module: 'health', path: '/health/summary', description: 'a summary for a new doctor' },
    ]);
  }
}

/** The treatment of the mind that touches the range. */
export function mindPeriods(record: HealthRecord, range: Period): Omit<TimelinePeriod, 'module'>[] {
  const mindVisits = new Set(
    record.visits.filter((v) => v.speciality && MIND.has(v.speciality)).map((v) => v.id),
  );
  const medications = record.medications
    .filter((m) => m.startedOn && m.visitId && mindVisits.has(m.visitId))
    .map((m) => ({
      kind: 'medication',
      title: m.name,
      subtitle: [m.dose, m.schedule].filter(Boolean).join(', ') || null,
      from: m.startedOn as string,
      to: m.stoppedOn,
    }));
  const conditions = healthConditions(record.diagnoses)
    .filter((c) => isMind(c.system, c.code) && c.status !== 'ruledOut')
    .map((c) => ({
      kind: 'diagnosis',
      title: c.code ? `${c.code} ${c.title}` : c.title,
      subtitle: null,
      from: c.firstOn,
      // In remission or taken off — over at its last diagnosis; otherwise still going on.
      to: c.status === 'remission' || c.status === 'resolved' ? c.lastOn : null,
    }));
  return [...medications, ...conditions].filter(
    (period) => period.from <= range.to && (period.to === null || period.to >= range.from),
  );
}

function isMind(system: string, code: string | null): boolean {
  if (!code) {
    return false;
  }
  return system === 'icd11' ? code.startsWith('6') : code.startsWith('F');
}
