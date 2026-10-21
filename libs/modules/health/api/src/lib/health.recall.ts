import { Injectable, OnModuleInit } from '@nestjs/common';
import { RecallService } from '@pd/api-core';
import { HealthService } from './health.service';

/**
 * Health in search by meaning ("when did I last have these symptoms?"): visits, diagnoses and
 * medications, read decrypted. Only when Health may go to the embedding model — a Health kept
 * to a local connection of its own is left out (see RecallService).
 */
@Injectable()
export class HealthRecall implements OnModuleInit {
  constructor(
    private readonly recall: RecallService,
    private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    this.recall.register({
      module: 'health',
      items: async (userId) => {
        const record = await this.health.record(userId);
        const join = (...parts: (string | null)[]) => parts.filter(Boolean).join('\n');
        return [
          ...record.visits.map((visit) => ({
            id: `visit:${visit.id}`,
            title: `Visit${visit.speciality ? ` — ${visit.speciality}` : ''}, ${visit.visitedOn}`,
            text: join(
              visit.speciality,
              visit.complaints,
              visit.findings,
              visit.recommendations,
              visit.notes,
            ),
            date: visit.visitedOn,
            link: '/health/history',
          })),
          ...record.diagnoses.map((diagnosis) => ({
            id: `diagnosis:${diagnosis.id}`,
            title: diagnosis.code ? `${diagnosis.code} ${diagnosis.title}` : diagnosis.title,
            text: join(diagnosis.title, diagnosis.notes),
            date: diagnosis.diagnosedOn,
            link: '/health/conditions',
          })),
          ...record.medications.map((medication) => ({
            id: `medication:${medication.id}`,
            title: medication.name,
            text: join(
              medication.name,
              medication.substance,
              medication.dose,
              medication.schedule,
              medication.notes,
            ),
            date: null,
            link: '/health/medications',
          })),
        ];
      },
    });
  }
}
