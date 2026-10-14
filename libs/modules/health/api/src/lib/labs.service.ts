import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  HealthLabPanel,
  healthLabPanelInputSchema,
  HealthLabValue,
  HealthStudy,
  healthStudyInputSchema,
  labFlag,
  toCanonical,
} from '@pd/contracts';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  healthDocuments,
  HealthLabPanelRow,
  healthLabPanels,
  HealthLabValueRow,
  healthLabValues,
  HealthStudyRow,
  healthStudies,
  healthVisits,
} from './health.schema';
import { assertOwnedId, found, removeOwned } from './owned';

export type ValidLabPanelInput = z.output<typeof healthLabPanelInputSchema>;
export type ValidStudyInput = z.output<typeof healthStudyInputSchema>;

/**
 * Lab results and studies. A report is saved as a whole: its lines are replaced together, in
 * the order of the report. A line keeps the laboratory's own unit and range; its value in the
 * analyte's unit and whether it is out of range are worked out on reading.
 */
@Injectable()
export class LabsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async panels(userId: string): Promise<HealthLabPanel[]> {
    const [panels, values] = await Promise.all([
      this.db
        .select()
        .from(healthLabPanels)
        .where(eq(healthLabPanels.userId, userId))
        .orderBy(desc(healthLabPanels.takenOn), desc(healthLabPanels.createdAt)),
      this.db
        .select()
        .from(healthLabValues)
        .where(eq(healthLabValues.userId, userId))
        .orderBy(asc(healthLabValues.position)),
    ]);
    const byPanel = new Map<string, HealthLabValue[]>();
    for (const row of values) {
      byPanel.set(row.panelId, [...(byPanel.get(row.panelId) ?? []), toValue(row)]);
    }
    return panels.map((row) => toPanel(row, byPanel.get(row.id) ?? []));
  }

  async savePanel(userId: string, input: ValidLabPanelInput, id?: string): Promise<HealthLabPanel> {
    await assertOwnedId(this.db, userId, healthVisits, input.visitId, 'Visit');
    await assertOwnedId(this.db, userId, healthDocuments, input.documentId, 'Document');
    const fields = {
      takenOn: input.takenOn,
      laboratory: input.laboratory || null,
      country: input.country ?? null,
      visitId: input.visitId ?? null,
      documentId: input.documentId ?? null,
      notes: input.notes || null,
    };
    return this.db.transaction(async (tx) => {
      const [panel] = id
        ? await tx
            .update(healthLabPanels)
            .set(fields)
            .where(and(eq(healthLabPanels.id, id), eq(healthLabPanels.userId, userId)))
            .returning()
        : await tx
            .insert(healthLabPanels)
            .values({ userId, ...fields })
            .returning();
      found(panel, 'Lab report');
      await tx.delete(healthLabValues).where(eq(healthLabValues.panelId, panel.id));
      const values = await tx
        .insert(healthLabValues)
        .values(
          input.values.map((line, position) => ({
            userId,
            panelId: panel.id,
            position,
            name: line.name,
            analyte: line.analyte || null,
            value: line.value ?? null,
            textValue: line.textValue || null,
            unit: line.unit || null,
            refLow: line.refLow ?? null,
            refHigh: line.refHigh ?? null,
            refText: line.refText || null,
          })),
        )
        .returning();
      return toPanel(panel, values.map(toValue));
    });
  }

  /** Its lines go with it. */
  async removePanel(userId: string, id: string): Promise<void> {
    await removeOwned(this.db, userId, healthLabPanels, id, 'Lab report');
  }

  async studies(userId: string): Promise<HealthStudy[]> {
    const rows = await this.db
      .select()
      .from(healthStudies)
      .where(eq(healthStudies.userId, userId))
      .orderBy(desc(healthStudies.performedOn));
    return rows.map(toStudy);
  }

  async saveStudy(userId: string, input: ValidStudyInput, id?: string): Promise<HealthStudy> {
    await assertOwnedId(this.db, userId, healthVisits, input.visitId, 'Visit');
    await assertOwnedId(this.db, userId, healthDocuments, input.documentId, 'Document');
    const values = {
      kind: input.kind,
      area: input.area || null,
      performedOn: input.performedOn,
      conclusion: input.conclusion || null,
      visitId: input.visitId ?? null,
      documentId: input.documentId ?? null,
      notes: input.notes || null,
    };
    const [row] = id
      ? await this.db
          .update(healthStudies)
          .set(values)
          .where(and(eq(healthStudies.id, id), eq(healthStudies.userId, userId)))
          .returning()
      : await this.db
          .insert(healthStudies)
          .values({ userId, ...values })
          .returning();
    return toStudy(found(row, 'Study'));
  }

  async removeStudy(userId: string, id: string): Promise<void> {
    await removeOwned(this.db, userId, healthStudies, id, 'Study');
  }
}

function toPanel(row: HealthLabPanelRow, values: HealthLabValue[]): HealthLabPanel {
  return {
    id: row.id,
    takenOn: row.takenOn,
    laboratory: row.laboratory,
    country: row.country,
    visitId: row.visitId,
    documentId: row.documentId,
    notes: row.notes,
    values,
  };
}

function toValue(row: HealthLabValueRow): HealthLabValue {
  return {
    id: row.id,
    name: row.name,
    analyte: row.analyte,
    value: row.value,
    textValue: row.textValue,
    unit: row.unit,
    refLow: row.refLow,
    refHigh: row.refHigh,
    refText: row.refText,
    flag: labFlag(row.value, row.refLow, row.refHigh),
    canonical:
      row.value === null
        ? null
        : toCanonical(row.analyte, row.value, row.unit, { low: row.refLow, high: row.refHigh }),
  };
}

function toStudy(row: HealthStudyRow): HealthStudy {
  return {
    id: row.id,
    kind: row.kind,
    area: row.area,
    performedOn: row.performedOn,
    conclusion: row.conclusion,
    visitId: row.visitId,
    documentId: row.documentId,
    notes: row.notes,
  };
}
