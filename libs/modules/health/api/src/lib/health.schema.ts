import { encryptedBytes, encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { DiagnosisStatus, HealthDocumentKind, HealthStudyKind, IcdSystem } from '@pd/contracts';
import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * What a person writes or a doctor says is stored encrypted (`encryptedText`, see
 * encrypted-columns.ts); dates, countries and ICD codes stay plain, so a history can be sorted
 * and filtered by them.
 */

const owner = () =>
  uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const created = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const healthClinics = pgTable(
  'health_clinics',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    name: text().notNull(),
    /** ISO 3166-1 alpha-2. */
    country: text(),
    city: text(),
    contacts: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId)],
);

export const healthDoctors = pgTable(
  'health_doctors',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    name: text().notNull(),
    /** A key of HEALTH_SPECIALITIES or as written. */
    speciality: text(),
    clinicId: uuid().references(() => healthClinics.id, { onDelete: 'set null' }),
    contacts: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId)],
);

export const healthVisits = pgTable(
  'health_visits',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    visitedOn: date({ mode: 'string' }).notNull(),
    clinicId: uuid().references(() => healthClinics.id, { onDelete: 'set null' }),
    doctorId: uuid().references(() => healthDoctors.id, { onDelete: 'set null' }),
    speciality: text(),
    country: text(),
    complaints: encryptedText(),
    findings: encryptedText(),
    recommendations: encryptedText(),
    notes: encryptedText(),
    nextVisitOn: date({ mode: 'string' }),
    language: text(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId, table.visitedOn)],
);

/**
 * A diagnosis as one document gives it. The same code over the years — from different clinics
 * and countries — is one condition with its history; the page groups them by the code.
 * A visit deleted leaves its diagnoses: they are part of the history on their own.
 */
export const healthDiagnoses = pgTable(
  'health_diagnoses',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    system: text().$type<IcdSystem>().notNull(),
    code: text(),
    title: encryptedText().notNull(),
    status: text().$type<DiagnosisStatus>().notNull(),
    diagnosedOn: date({ mode: 'string' }).notNull(),
    visitId: uuid().references(() => healthVisits.id, { onDelete: 'set null' }),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId, table.code)],
);

export const healthMedications = pgTable(
  'health_medications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    name: encryptedText().notNull(),
    substance: encryptedText(),
    dose: encryptedText(),
    schedule: encryptedText(),
    startedOn: date({ mode: 'string' }),
    stoppedOn: date({ mode: 'string' }),
    stopReason: encryptedText(),
    visitId: uuid().references(() => healthVisits.id, { onDelete: 'set null' }),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId)],
);

/** A scan, a photo or a PDF of a document; the original is always kept. */
export const healthDocuments = pgTable(
  'health_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    name: encryptedText().notNull(),
    kind: text().$type<HealthDocumentKind>().notNull(),
    documentedOn: date({ mode: 'string' }),
    visitId: uuid().references(() => healthVisits.id, { onDelete: 'set null' }),
    /** The export names the file by it (see data-archive.ts). */
    mimeType: text().notNull(),
    size: integer().notNull(),
    data: encryptedBytes().notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId)],
);

/** A lab report: the day the samples were taken, the laboratory, and its lines. */
export const healthLabPanels = pgTable(
  'health_lab_panels',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    takenOn: date({ mode: 'string' }).notNull(),
    laboratory: encryptedText(),
    country: text(),
    visitId: uuid().references(() => healthVisits.id, { onDelete: 'set null' }),
    documentId: uuid().references(() => healthDocuments.id, { onDelete: 'set null' }),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId, table.takenOn)],
);

/**
 * A line of a lab report as the laboratory gave it — its own unit and range; the value in the
 * analyte's unit is worked out on reading (see toCanonical), so a better table fixes old ones.
 */
export const healthLabValues = pgTable(
  'health_lab_values',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    panelId: uuid()
      .notNull()
      .references(() => healthLabPanels.id, { onDelete: 'cascade' }),
    /** The order of the report. */
    position: integer().notNull(),
    name: encryptedText().notNull(),
    analyte: text(),
    value: doublePrecision(),
    textValue: encryptedText(),
    unit: text(),
    refLow: doublePrecision(),
    refHigh: doublePrecision(),
    refText: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.panelId), index().on(table.userId, table.analyte)],
);

/** Ultrasound, MRI, ECG and the like, as their conclusions. */
export const healthStudies = pgTable(
  'health_studies',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    kind: text().$type<HealthStudyKind>().notNull(),
    area: encryptedText(),
    performedOn: date({ mode: 'string' }).notNull(),
    conclusion: encryptedText(),
    visitId: uuid().references(() => healthVisits.id, { onDelete: 'set null' }),
    documentId: uuid().references(() => healthDocuments.id, { onDelete: 'set null' }),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => [index().on(table.userId, table.performedOn)],
);

/**
 * The ICD dictionary the user loaded from its publisher (see IcdDictionaryService). It is
 * never shipped with the dashboard and never exported: the publisher's terms allow neither.
 */
export const healthIcdCodes = pgTable(
  'health_icd_codes',
  {
    userId: owner(),
    system: text().$type<IcdSystem>().notNull(),
    language: text().notNull(),
    code: text().notNull(),
    title: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.system, table.language, table.code] })],
);

registerEncryptedTables(
  healthClinics,
  healthDoctors,
  healthVisits,
  healthDiagnoses,
  healthMedications,
  healthDocuments,
  healthLabPanels,
  healthLabValues,
  healthStudies,
);

export type HealthClinicRow = typeof healthClinics.$inferSelect;
export type HealthDoctorRow = typeof healthDoctors.$inferSelect;
export type HealthVisitRow = typeof healthVisits.$inferSelect;
export type HealthDiagnosisRow = typeof healthDiagnoses.$inferSelect;
export type HealthMedicationRow = typeof healthMedications.$inferSelect;
export type HealthDocumentRow = typeof healthDocuments.$inferSelect;
export type HealthLabPanelRow = typeof healthLabPanels.$inferSelect;
export type HealthLabValueRow = typeof healthLabValues.$inferSelect;
export type HealthStudyRow = typeof healthStudies.$inferSelect;
