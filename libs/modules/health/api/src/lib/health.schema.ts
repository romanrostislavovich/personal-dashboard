import {
  encryptedBytes,
  encryptedText,
  registerEncryptedTables,
  users,
} from '@pd/api-core/schema';
import {
  AllergySeverity,
  BloodType,
  DiagnosisStatus,
  HealthDocumentKind,
  HealthStudyKind,
  IcdSystem,
  IntakeStatus,
  SummaryLanguage,
} from '@pd/contracts';
import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
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
    .references(() => users.id, {onDelete: 'cascade'});
const created = () => timestamp({withTimezone: true}).notNull().defaultNow();
const updated = () =>
  timestamp({withTimezone: true})
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
  table => [index().on(table.userId)],
);

export const healthDoctors = pgTable(
  'health_doctors',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    name: text().notNull(),
    /** A key of HEALTH_SPECIALITIES or as written. */
    speciality: text(),
    clinicId: uuid().references(() => healthClinics.id, {onDelete: 'set null'}),
    contacts: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId), index().on(table.clinicId)],
);

export const healthVisits = pgTable(
  'health_visits',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    visitedOn: date({mode: 'string'}).notNull(),
    clinicId: uuid().references(() => healthClinics.id, {onDelete: 'set null'}),
    doctorId: uuid().references(() => healthDoctors.id, {onDelete: 'set null'}),
    speciality: text(),
    country: text(),
    complaints: encryptedText(),
    findings: encryptedText(),
    recommendations: encryptedText(),
    notes: encryptedText(),
    nextVisitOn: date({mode: 'string'}),
    language: text(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [
    index().on(table.userId, table.visitedOn),
    index().on(table.clinicId),
    index().on(table.doctorId),
  ],
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
    diagnosedOn: date({mode: 'string'}).notNull(),
    visitId: uuid().references(() => healthVisits.id, {onDelete: 'set null'}),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId, table.code), index().on(table.visitId)],
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
    startedOn: date({mode: 'string'}),
    stoppedOn: date({mode: 'string'}),
    stopReason: encryptedText(),
    visitId: uuid().references(() => healthVisits.id, {onDelete: 'set null'}),
    notes: encryptedText(),
    /** `HH:mm` on the user's clock to be reminded at; empty — no reminders. */
    reminderTimes: text().array().notNull().default([]),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId), index().on(table.visitId)],
);

/**
 * A reminder to take a medication at one of its times on one day, and the answer. One row a
 * medication, day and time: the job sends it once however often it runs.
 */
export const healthIntakes = pgTable(
  'health_intakes',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    medicationId: uuid()
      .notNull()
      .references(() => healthMedications.id, {onDelete: 'cascade'}),
    day: date({mode: 'string'}).notNull(),
    time: text().notNull(),
    status: text().$type<IntakeStatus>().notNull().default('pending'),
    answeredAt: timestamp({withTimezone: true}),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [
    unique().on(table.medicationId, table.day, table.time),
    index().on(table.userId, table.day),
  ],
);

/** What a doctor asks first: the blood type and what to know in an emergency. */
export const healthProfiles = pgTable('health_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {onDelete: 'cascade'}),
  bloodType: text().$type<BloodType>(),
  notes: encryptedText(),
  /** The contacts of the ICE card, as JSON (see emergencyContactSchema): encrypted too. */
  emergencyContacts: encryptedText(),
  updatedAt: updated(),
});

export const healthAllergies = pgTable(
  'health_allergies',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    substance: encryptedText().notNull(),
    reaction: encryptedText(),
    severity: text().$type<AllergySeverity>(),
    since: date({mode: 'string'}),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId)],
);

export const healthVaccinations = pgTable(
  'health_vaccinations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    vaccine: encryptedText().notNull(),
    dose: encryptedText(),
    givenOn: date({mode: 'string'}).notNull(),
    country: text(),
    nextDueOn: date({mode: 'string'}),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId)],
);

export const healthOperations = pgTable(
  'health_operations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    title: encryptedText().notNull(),
    performedOn: date({mode: 'string'}).notNull(),
    clinic: encryptedText(),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId)],
);

/** A scan, a photo or a PDF of a document; the original is always kept. */
export const healthDocuments = pgTable(
  'health_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    name: encryptedText().notNull(),
    kind: text().$type<HealthDocumentKind>().notNull(),
    documentedOn: date({mode: 'string'}),
    visitId: uuid().references(() => healthVisits.id, {onDelete: 'set null'}),
    /** The export names the file by it (see data-archive.ts). */
    mimeType: text().notNull(),
    size: integer().notNull(),
    data: encryptedBytes().notNull(),
    /** What the AI read out of it, as JSON, until the user saves or drops it. */
    draft: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId), index().on(table.visitId)],
);

/**
 * The second and later pages of a photographed document, in order; the first is the
 * document's own `data`. They go with the document.
 */
export const healthDocumentPages = pgTable(
  'health_document_pages',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    documentId: uuid()
      .notNull()
      .references(() => healthDocuments.id, {onDelete: 'cascade'}),
    /** 2 for the second page, and so on. */
    page: integer().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    data: encryptedBytes().notNull(),
    createdAt: created(),
  },
  table => [
    unique().on(table.documentId, table.page),
    index().on(table.userId),
  ],
);

/** A lab report: the day the samples were taken, the laboratory, and its lines. */
export const healthLabPanels = pgTable(
  'health_lab_panels',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    takenOn: date({mode: 'string'}).notNull(),
    laboratory: encryptedText(),
    country: text(),
    visitId: uuid().references(() => healthVisits.id, {onDelete: 'set null'}),
    documentId: uuid().references(() => healthDocuments.id, {
      onDelete: 'set null',
    }),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [
    index().on(table.userId, table.takenOn),
    index().on(table.visitId),
    index().on(table.documentId),
  ],
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
      .references(() => healthLabPanels.id, {onDelete: 'cascade'}),
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
  table => [index().on(table.panelId), index().on(table.userId, table.analyte)],
);

/** Ultrasound, MRI, ECG and the like, as their conclusions. */
export const healthStudies = pgTable(
  'health_studies',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    kind: text().$type<HealthStudyKind>().notNull(),
    area: encryptedText(),
    performedOn: date({mode: 'string'}).notNull(),
    conclusion: encryptedText(),
    visitId: uuid().references(() => healthVisits.id, {onDelete: 'set null'}),
    documentId: uuid().references(() => healthDocuments.id, {
      onDelete: 'set null',
    }),
    notes: encryptedText(),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [
    index().on(table.userId, table.performedOn),
    index().on(table.visitId),
    index().on(table.documentId),
  ],
);

/**
 * A link that shows a summary to a doctor without signing in. Only the hash of its token is
 * kept; the summary is frozen when the link is made (what the user saw is what the doctor
 * sees), stored encrypted, and is gone for the link once it expires or is revoked.
 */
export const healthShares = pgTable(
  'health_shares',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: owner(),
    tokenHash: text().notNull().unique(),
    note: encryptedText(),
    language: text().$type<SummaryLanguage>().notNull(),
    /** The HTML of the summary, as it was made. */
    page: encryptedText().notNull(),
    expiresAt: timestamp({withTimezone: true}).notNull(),
    revokedAt: timestamp({withTimezone: true}),
    opened: integer().notNull().default(0),
    lastOpenedAt: timestamp({withTimezone: true}),
    createdAt: created(),
    updatedAt: updated(),
  },
  table => [index().on(table.userId)],
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
  table => [
    primaryKey({
      columns: [table.userId, table.system, table.language, table.code],
    }),
  ],
);

registerEncryptedTables(
  healthClinics,
  healthDoctors,
  healthVisits,
  healthDiagnoses,
  healthMedications,
  healthDocuments,
  healthDocumentPages,
  healthLabPanels,
  healthLabValues,
  healthStudies,
  healthShares,
  healthProfiles,
  healthAllergies,
  healthVaccinations,
  healthOperations,
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
export type HealthShareRow = typeof healthShares.$inferSelect;
export type HealthIntakeRow = typeof healthIntakes.$inferSelect;
export type HealthAllergyRow = typeof healthAllergies.$inferSelect;
export type HealthVaccinationRow = typeof healthVaccinations.$inferSelect;
export type HealthOperationRow = typeof healthOperations.$inferSelect;
