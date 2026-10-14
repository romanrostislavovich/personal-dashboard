import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { compressImage, Database, DB } from '@pd/api-core';
import {
  HEALTH_DOCUMENT_MAX_PAGES,
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
  isHealthPageType,
} from '@pd/contracts';
import { and, asc, desc, eq, gt, max, sql } from 'drizzle-orm';
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
  healthDocumentPages,
  healthDocuments,
  HealthMedicationRow,
  healthMedications,
  HealthVisitRow,
  healthVisits,
} from './health.schema';
import { recentIntakes } from './intakes/intakes.service';
import { LabsService } from './labs.service';
import { found, removeOwned } from './owned';
import { readProfile } from './profile/profile.service';

/** How far back the reminders and their answers are read. */
const INTAKE_DAYS = 30;

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
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly labs: LabsService,
  ) {}

  async record(userId: string): Promise<HealthRecord> {
    const [clinics, doctors, visits, diagnoses, medications, documents, labPanels, studies] =
      await Promise.all([
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
        this.labs.panels(userId),
        this.labs.studies(userId),
      ]);
    const since = new Date(Date.now() - INTAKE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const [profile, intakes] = await Promise.all([
      readProfile(this.db, userId),
      recentIntakes(this.db, userId, since),
    ]);
    return {
      // Names are encrypted, so they are sorted here and not in the query.
      clinics: clinics.map(toClinic).sort(byName),
      doctors: doctors.map(toDoctor).sort(byName),
      visits: visits.map(toVisit),
      diagnoses: diagnoses.map(toDiagnosis),
      medications: medications.map(toMedication).sort(byStart),
      documents: documents.map(toDocument),
      labPanels,
      studies,
      profile,
      intakes,
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
      reminderTimes: [...new Set(input.reminderTimes)].sort(),
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
    // A photographed page is made small before it is encrypted; a PDF stays as it is.
    const { data, mimeType } = await compressImage(file);
    const [row] = await this.db
      .insert(healthDocuments)
      .values({
        userId,
        name: input.name,
        kind: input.kind,
        documentedOn: input.documentedOn ?? null,
        visitId: input.visitId ?? null,
        mimeType,
        size: data.length,
        data,
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

  /** A page of it: the first is the document's own file. */
  async documentFile(
    userId: string,
    id: string,
    page = 1,
  ): Promise<{ data: Buffer; mimeType: string }> {
    if (page > 1) {
      const [row] = await this.db
        .select({ data: healthDocumentPages.data, mimeType: healthDocumentPages.mimeType })
        .from(healthDocumentPages)
        .where(
          and(
            eq(healthDocumentPages.documentId, id),
            eq(healthDocumentPages.userId, userId),
            eq(healthDocumentPages.page, page),
          ),
        );
      return found(row, 'Page');
    }
    const [row] = await this.db
      .select({ data: healthDocuments.data, mimeType: healthDocuments.mimeType })
      .from(healthDocuments)
      .where(and(eq(healthDocuments.id, id), eq(healthDocuments.userId, userId)));
    return found(row, 'Document');
  }

  /** Every page, in order: what the AI reads. */
  async documentPages(userId: string, id: string): Promise<{ data: Buffer; mimeType: string }[]> {
    const first = await this.documentFile(userId, id);
    const rest = await this.db
      .select({ data: healthDocumentPages.data, mimeType: healthDocumentPages.mimeType })
      .from(healthDocumentPages)
      .where(and(eq(healthDocumentPages.documentId, id), eq(healthDocumentPages.userId, userId)))
      .orderBy(asc(healthDocumentPages.page));
    return [first, ...rest];
  }

  /** One more photographed page at the end; a PDF has its own pages and takes none. */
  async addPage(
    userId: string,
    id: string,
    file: { data: Buffer; mimeType: string },
  ): Promise<HealthDocument> {
    const [document] = await this.db
      .select({ mimeType: healthDocuments.mimeType })
      .from(healthDocuments)
      .where(and(eq(healthDocuments.id, id), eq(healthDocuments.userId, userId)));
    if (
      !isHealthPageType(found(document, 'Document').mimeType) ||
      !isHealthPageType(file.mimeType)
    ) {
      throw new BadRequestException(
        'Pages are photos (JPEG, PNG, WebP) of a photographed document',
      );
    }
    const pages = await this.pageCount(id);
    if (pages >= HEALTH_DOCUMENT_MAX_PAGES) {
      throw new BadRequestException(`A document has ${HEALTH_DOCUMENT_MAX_PAGES} pages at most`);
    }
    const { data, mimeType } = await compressImage(file);
    await this.db.insert(healthDocumentPages).values({
      userId,
      documentId: id,
      page: pages + 1,
      mimeType,
      size: data.length,
      data,
    });
    return this.document(userId, id);
  }

  /** A page taken out; the ones after it move up. The first page is the document itself. */
  async removePage(userId: string, id: string, page: number): Promise<HealthDocument> {
    if (page < 2) {
      throw new BadRequestException('The first page goes only with the whole document');
    }
    await this.db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(healthDocumentPages)
        .where(
          and(
            eq(healthDocumentPages.documentId, id),
            eq(healthDocumentPages.userId, userId),
            eq(healthDocumentPages.page, page),
          ),
        )
        .returning({ id: healthDocumentPages.id });
      found(removed, 'Page');
      // One by one, up from the next: (document, page) stays unique on every step.
      const later = await tx
        .select({ id: healthDocumentPages.id, page: healthDocumentPages.page })
        .from(healthDocumentPages)
        .where(and(eq(healthDocumentPages.documentId, id), gt(healthDocumentPages.page, page)))
        .orderBy(asc(healthDocumentPages.page));
      for (const row of later) {
        await tx
          .update(healthDocumentPages)
          .set({ page: row.page - 1 })
          .where(eq(healthDocumentPages.id, row.id));
      }
    });
    return this.document(userId, id);
  }

  private async document(userId: string, id: string): Promise<HealthDocument> {
    const [row] = await this.db
      .select(documentColumns)
      .from(healthDocuments)
      .where(and(eq(healthDocuments.id, id), eq(healthDocuments.userId, userId)));
    return toDocument(found(row, 'Document'));
  }

  private async pageCount(id: string): Promise<number> {
    const [row] = await this.db
      .select({ last: max(healthDocumentPages.page) })
      .from(healthDocumentPages)
      .where(eq(healthDocumentPages.documentId, id));
    return row?.last ?? 1;
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

  private remove(
    userId: string,
    table: Owned | typeof healthDiagnoses | typeof healthMedications | typeof healthDocuments,
    id: string,
    what: string,
  ): Promise<void> {
    return removeOwned(this.db, userId, table, id, what);
  }
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
  hasDraft: sql<boolean>`${healthDocuments.draft} is not null`,
  // Named in full: inside the subquery a bare `id` would be the page's own.
  pages: sql<number>`(select coalesce(max(p.page), 1) from health_document_pages p where p.document_id = health_documents.id)::int`,
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
    reminderTimes: row.reminderTimes,
  };
}

function toDocument(
  row: Omit<HealthDocumentRow, 'data' | 'draft' | 'userId' | 'updatedAt'> & {
    hasDraft: boolean;
    pages: number;
  },
): HealthDocument {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    documentedOn: row.documentedOn,
    visitId: row.visitId,
    mimeType: row.mimeType,
    size: row.size,
    pages: row.pages,
    hasDraft: row.hasDraft,
    createdAt: row.createdAt.toISOString(),
  };
}
