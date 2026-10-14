import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  HEALTH_DOCUMENT_TYPES,
  HealthClinic,
  healthClinicInputSchema,
  HealthDiagnosis,
  healthDiagnosisInputSchema,
  HealthDoctor,
  healthDoctorInputSchema,
  HealthDocument,
  healthDocumentInputSchema,
  HealthMedication,
  healthMedicationInputSchema,
  HealthRecord,
  HealthVisit,
  healthVisitInputSchema,
} from '@pd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import {
  HealthClinicRow,
  healthClinics,
  HealthDiagnosisRow,
  healthDiagnoses,
  HealthDoctorRow,
  healthDoctors,
  HealthDocumentRow,
  healthDocuments,
  HealthMedicationRow,
  healthMedications,
  HealthVisitRow,
  healthVisits,
} from './health.schema';

export type ValidClinicInput = z.output<typeof healthClinicInputSchema>;
export type ValidDoctorInput = z.output<typeof healthDoctorInputSchema>;
export type ValidVisitInput = z.output<typeof healthVisitInputSchema>;
export type ValidDiagnosisInput = z.output<typeof healthDiagnosisInputSchema>;
export type ValidMedicationInput = z.output<typeof healthMedicationInputSchema>;
export type ValidDocumentInput = z.output<typeof healthDocumentInputSchema>;

/** A table of the module: every one has `id` and `userId`. */
type Owned = typeof healthClinics | typeof healthDoctors | typeof healthVisits;

/**
 * The medical history of a user: clinics and doctors, visits, diagnoses, medications and the
 * documents. Every record a record points to must be the user's own.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async record(userId: string): Promise<HealthRecord> {
    const [clinics, doctors, visits, diagnoses, medications, documents] = await Promise.all([
      this.db.select().from(healthClinics).where(eq(healthClinics.userId, userId)),
      this.db.select().from(healthDoctors).where(eq(healthDoctors.userId, userId)),
      this.db
        .select()
        .from(healthVisits)
        .where(eq(healthVisits.userId, userId))
        .orderBy(desc(healthVisits.visitedOn), desc(healthVisits.createdAt)),
      this.db
        .select()
        .from(healthDiagnoses)
        .where(eq(healthDiagnoses.userId, userId))
        .orderBy(desc(healthDiagnoses.diagnosedOn)),
      this.db.select().from(healthMedications).where(eq(healthMedications.userId, userId)),
      this.db
        .select(documentColumns)
        .from(healthDocuments)
        .where(eq(healthDocuments.userId, userId))
        .orderBy(desc(healthDocuments.createdAt)),
    ]);
    return {
      // Names are encrypted, so they are sorted here and not in the query.
      clinics: clinics.map(toClinic).sort(byName),
      doctors: doctors.map(toDoctor).sort(byName),
      visits: visits.map(toVisit),
      diagnoses: diagnoses.map(toDiagnosis),
      medications: medications.map(toMedication).sort(byStart),
      documents: documents.map(toDocument),
    };
  }

  // --- Clinics ---

  async saveClinic(userId: string, input: ValidClinicInput, id?: string): Promise<HealthClinic> {
    const values = {
      name: input.name,
      country: input.country ?? null,
      city: input.city || null,
      contacts: input.contacts || null,
    };
    const [row] = id
      ? await this.db
          .update(healthClinics)
          .set(values)
          .where(and(eq(healthClinics.id, id), eq(healthClinics.userId, userId)))
          .returning()
      : await this.db
          .insert(healthClinics)
          .values({ userId, ...values })
          .returning();
    return toClinic(found(row, 'Clinic'));
  }

  async removeClinic(userId: string, id: string): Promise<void> {
    await this.remove(userId, healthClinics, id, 'Clinic');
  }

  // --- Doctors ---

  async saveDoctor(userId: string, input: ValidDoctorInput, id?: string): Promise<HealthDoctor> {
    await this.assertOwned(userId, healthClinics, input.clinicId, 'Clinic');
    const values = {
      name: input.name,
      speciality: input.speciality || null,
      clinicId: input.clinicId ?? null,
      contacts: input.contacts || null,
    };
    const [row] = id
      ? await this.db
          .update(healthDoctors)
          .set(values)
          .where(and(eq(healthDoctors.id, id), eq(healthDoctors.userId, userId)))
          .returning()
      : await this.db
          .insert(healthDoctors)
          .values({ userId, ...values })
          .returning();
    return toDoctor(found(row, 'Doctor'));
  }

  async removeDoctor(userId: string, id: string): Promise<void> {
    await this.remove(userId, healthDoctors, id, 'Doctor');
  }

  // --- Visits ---

  /** The speciality and the country, when not given, come from the doctor and the clinic. */
  async saveVisit(userId: string, input: ValidVisitInput, id?: string): Promise<HealthVisit> {
    const clinic = await this.assertOwned(userId, healthClinics, input.clinicId, 'Clinic');
    const doctor = await this.assertOwned(userId, healthDoctors, input.doctorId, 'Doctor');
    const values = {
      visitedOn: input.visitedOn,
      clinicId: input.clinicId ?? null,
      doctorId: input.doctorId ?? null,
      speciality: input.speciality || doctor?.speciality || null,
      country: input.country ?? clinic?.country ?? null,
      complaints: input.complaints || null,
      findings: input.findings || null,
      recommendations: input.recommendations || null,
      notes: input.notes || null,
      nextVisitOn: input.nextVisitOn ?? null,
      language: input.language || null,
    };
    const [row] = id
      ? await this.db
          .update(healthVisits)
          .set(values)
          .where(and(eq(healthVisits.id, id), eq(healthVisits.userId, userId)))
          .returning()
      : await this.db
          .insert(healthVisits)
          .values({ userId, ...values })
          .returning();
    return toVisit(found(row, 'Visit'));
  }

  /** Its diagnoses, medications and documents stay, without the visit. */
  async removeVisit(userId: string, id: string): Promise<void> {
    await this.remove(userId, healthVisits, id, 'Visit');
  }

  // --- Diagnoses ---

  async saveDiagnosis(
    userId: string,
    input: ValidDiagnosisInput,
    id?: string,
  ): Promise<HealthDiagnosis> {
    await this.assertOwned(userId, healthVisits, input.visitId, 'Visit');
    const values = {
      system: input.system,
      code: input.code || null,
      title: input.title,
      status: input.status,
      diagnosedOn: input.diagnosedOn,
      visitId: input.visitId ?? null,
      notes: input.notes || null,
    };
    const [row] = id
      ? await this.db
          .update(healthDiagnoses)
          .set(values)
          .where(and(eq(healthDiagnoses.id, id), eq(healthDiagnoses.userId, userId)))
          .returning()
      : await this.db
          .insert(healthDiagnoses)
          .values({ userId, ...values })
          .returning();
    return toDiagnosis(found(row, 'Diagnosis'));
  }

  async removeDiagnosis(userId: string, id: string): Promise<void> {
    await this.remove(userId, healthDiagnoses, id, 'Diagnosis');
  }

  // --- Medications ---

  async saveMedication(
    userId: string,
    input: ValidMedicationInput,
    id?: string,
  ): Promise<HealthMedication> {
    await this.assertOwned(userId, healthVisits, input.visitId, 'Visit');
    const values = {
      name: input.name,
      substance: input.substance || null,
      dose: input.dose || null,
      schedule: input.schedule || null,
      startedOn: input.startedOn ?? null,
      stoppedOn: input.stoppedOn ?? null,
      stopReason: input.stopReason || null,
      visitId: input.visitId ?? null,
      notes: input.notes || null,
    };
    const [row] = id
      ? await this.db
          .update(healthMedications)
          .set(values)
          .where(and(eq(healthMedications.id, id), eq(healthMedications.userId, userId)))
          .returning()
      : await this.db
          .insert(healthMedications)
          .values({ userId, ...values })
          .returning();
    return toMedication(found(row, 'Medication'));
  }

  async removeMedication(userId: string, id: string): Promise<void> {
    await this.remove(userId, healthMedications, id, 'Medication');
  }

  // --- Documents ---

  async addDocument(
    userId: string,
    input: ValidDocumentInput,
    file: { data: Buffer; mimeType: string },
  ): Promise<HealthDocument> {
    if (!(HEALTH_DOCUMENT_TYPES as readonly string[]).includes(file.mimeType)) {
      throw new BadRequestException('Expected a PDF or an image (JPEG, PNG, WebP)');
    }
    await this.assertOwned(userId, healthVisits, input.visitId, 'Visit');
    const [row] = await this.db
      .insert(healthDocuments)
      .values({
        userId,
        name: input.name,
        kind: input.kind,
        documentedOn: input.documentedOn ?? null,
        visitId: input.visitId ?? null,
        mimeType: file.mimeType,
        size: file.data.length,
        data: file.data,
      })
      .returning(documentColumns);
    return toDocument(row);
  }

  async updateDocument(
    userId: string,
    id: string,
    input: ValidDocumentInput,
  ): Promise<HealthDocument> {
    await this.assertOwned(userId, healthVisits, input.visitId, 'Visit');
    const [row] = await this.db
      .update(healthDocuments)
      .set({
        name: input.name,
        kind: input.kind,
        documentedOn: input.documentedOn ?? null,
        visitId: input.visitId ?? null,
      })
      .where(and(eq(healthDocuments.id, id), eq(healthDocuments.userId, userId)))
      .returning(documentColumns);
    return toDocument(found(row, 'Document'));
  }

  async documentFile(userId: string, id: string): Promise<{ data: Buffer; mimeType: string }> {
    const [row] = await this.db
      .select({ data: healthDocuments.data, mimeType: healthDocuments.mimeType })
      .from(healthDocuments)
      .where(and(eq(healthDocuments.id, id), eq(healthDocuments.userId, userId)));
    return found(row, 'Document');
  }

  async removeDocument(userId: string, id: string): Promise<void> {
    await this.remove(userId, healthDocuments, id, 'Document');
  }

  // ---

  /** The row `id` points to, if any; another user's is as good as none. */
  private async assertOwned<T extends Owned>(
    userId: string,
    table: T,
    id: string | null | undefined,
    what: string,
  ): Promise<T['$inferSelect'] | null> {
    if (!id) {
      return null;
    }
    const [row] = await this.db
      .select()
      .from(table as PgTable & Owned)
      .where(and(eq(table.id, id), eq(table.userId, userId)));
    return found(row, what) as T['$inferSelect'];
  }

  private async remove(
    userId: string,
    table: Owned | typeof healthDiagnoses | typeof healthMedications | typeof healthDocuments,
    id: string,
    what: string,
  ): Promise<void> {
    const deleted = await this.db
      .delete(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .returning({ id: table.id });
    found(deleted[0], what);
  }
}

function found<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new NotFoundException(`${what} not found`);
  }
  return row;
}

/** Everything of a document but its bytes. */
const documentColumns = {
  id: healthDocuments.id,
  name: healthDocuments.name,
  kind: healthDocuments.kind,
  documentedOn: healthDocuments.documentedOn,
  visitId: healthDocuments.visitId,
  mimeType: healthDocuments.mimeType,
  size: healthDocuments.size,
  createdAt: healthDocuments.createdAt,
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** Still taken first, then by the start, the latest first. */
function byStart(a: HealthMedication, b: HealthMedication): number {
  const current = Number(b.stoppedOn === null) - Number(a.stoppedOn === null);
  return current || (b.startedOn ?? '').localeCompare(a.startedOn ?? '');
}

function toClinic(row: HealthClinicRow): HealthClinic {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    city: row.city,
    contacts: row.contacts,
  };
}

function toDoctor(row: HealthDoctorRow): HealthDoctor {
  return {
    id: row.id,
    name: row.name,
    speciality: row.speciality,
    clinicId: row.clinicId,
    contacts: row.contacts,
  };
}

function toVisit(row: HealthVisitRow): HealthVisit {
  return {
    id: row.id,
    visitedOn: row.visitedOn,
    clinicId: row.clinicId,
    doctorId: row.doctorId,
    speciality: row.speciality,
    country: row.country,
    complaints: row.complaints,
    findings: row.findings,
    recommendations: row.recommendations,
    notes: row.notes,
    nextVisitOn: row.nextVisitOn,
    language: row.language,
  };
}

function toDiagnosis(row: HealthDiagnosisRow): HealthDiagnosis {
  return {
    id: row.id,
    system: row.system,
    code: row.code,
    title: row.title,
    status: row.status,
    diagnosedOn: row.diagnosedOn,
    visitId: row.visitId,
    notes: row.notes,
  };
}

function toMedication(row: HealthMedicationRow): HealthMedication {
  return {
    id: row.id,
    name: row.name,
    substance: row.substance,
    dose: row.dose,
    schedule: row.schedule,
    startedOn: row.startedOn,
    stoppedOn: row.stoppedOn,
    stopReason: row.stopReason,
    visitId: row.visitId,
    notes: row.notes,
  };
}

function toDocument(row: Omit<HealthDocumentRow, 'data' | 'userId' | 'updatedAt'>): HealthDocument {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    documentedOn: row.documentedOn,
    visitId: row.visitId,
    mimeType: row.mimeType,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
  };
}
