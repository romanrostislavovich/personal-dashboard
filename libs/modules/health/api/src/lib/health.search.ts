import { Injectable, OnModuleInit } from '@nestjs/common';
import { SEARCH_LIMIT, SearchService, snippet } from '@pd/api-core';
import { HealthRecord, SearchHit } from '@pd/contracts';
import { HealthService } from './health.service';

/**
 * Health in the command palette: diagnoses by code or wording, medications, visits and
 * documents. The texts are stored encrypted, so they are searched after reading — a history of
 * one person is small.
 */
@Injectable()
export class HealthSearch implements OnModuleInit {
  constructor(
    private readonly search: SearchService,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    this.search.register({
      module: 'health',
      search: async (userId, query) => healthHits(await this.health.record(userId), query),
    });
  }
}

export function healthHits(record: HealthRecord, query: string): SearchHit[] {
  const wanted = query.trim().toLowerCase();
  const has = (...texts: (string | null)[]) =>
    texts.some((text) => text?.toLowerCase().includes(wanted));
  const hit = (kind: string, title: string, subtitle: string | null, url: string): SearchHit => ({
    module: 'health',
    kind,
    title,
    subtitle,
    url,
  });
  return [
    ...record.diagnoses
      .filter((d) => has(d.code, d.title, d.notes))
      .map((d) =>
        hit(
          'diagnosis',
          d.code ? `${d.code} ${d.title}` : d.title,
          d.diagnosedOn,
          '/health/conditions',
        ),
      ),
    ...record.medications
      .filter((m) => has(m.name, m.substance, m.notes))
      .map((m) =>
        hit(
          'medication',
          m.name,
          [m.dose, m.schedule].filter(Boolean).join(', ') || null,
          '/health/medications',
        ),
      ),
    ...record.visits
      .filter((v) => has(v.speciality, v.complaints, v.findings, v.recommendations, v.notes))
      .map((v) =>
        hit(
          'visit',
          v.visitedOn,
          snippet(
            [v.recommendations, v.findings, v.complaints, v.notes].filter(Boolean).join(' · ') ||
              (v.speciality ?? ''),
            query,
          ),
          '/health/history',
        ),
      ),
    ...record.documents
      .filter((d) => has(d.name))
      .map((d) => hit('document', d.name, d.documentedOn, '/health/history')),
  ].slice(0, SEARCH_LIMIT);
}
