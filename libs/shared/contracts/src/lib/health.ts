import { z } from 'zod';
import { LocalDate } from './local-date';

/**
 * Health: one medical history of one's own across countries and clinics — visits, diagnoses by
 * ICD code, medications and the documents they came with. Facts only: the dashboard never
 * interprets them. API: `/api/medical` (`/api/health` is the server's health check).
 */

const day = z.iso.date();
const optionalText = (max: number) => z.string().trim().max(max).nullish();

/** Countries are ISO 3166-1 alpha-2 codes: `UA`, `BY`, `PL`. */
const country = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'Expected a two-letter country code')
  .transform((code) => code.toUpperCase());

/** Countries offered first; any other code may be typed. */
export const HEALTH_COUNTRIES = ['UA', 'BY', 'PL'] as const;

/** Specialities with a translation (`health.specialities.<key>`); any other is kept as typed. */
export const HEALTH_SPECIALITIES = [
  'general',
  'psychiatrist',
  'psychotherapist',
  'psychologist',
  'neurologist',
  'cardiologist',
  'endocrinologist',
  'gastroenterologist',
  'dermatologist',
  'ophthalmologist',
  'ent',
  'dentist',
  'gynecologist',
  'urologist',
  'orthopedist',
  'surgeon',
  'allergist',
  'pulmonologist',
] as const;

// --- Clinics and doctors ---

export const healthClinicInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  country: country.nullish(),
  city: optionalText(100),
  contacts: optionalText(1000),
});
export type HealthClinicInput = z.input<typeof healthClinicInputSchema>;

export interface HealthClinic {
  id: string;
  name: string;
  country: string | null;
  city: string | null;
  contacts: string | null;
}

export const healthDoctorInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** A key of HEALTH_SPECIALITIES or the speciality as written. */
  speciality: optionalText(100),
  clinicId: z.uuid().nullish(),
  contacts: optionalText(1000),
});
export type HealthDoctorInput = z.input<typeof healthDoctorInputSchema>;

export interface HealthDoctor {
  id: string;
  name: string;
  speciality: string | null;
  clinicId: string | null;
  contacts: string | null;
}

// --- Visits ---

export const healthVisitInputSchema = z.object({
  visitedOn: day,
  clinicId: z.uuid().nullish(),
  doctorId: z.uuid().nullish(),
  /** Taken from the doctor when empty. */
  speciality: optionalText(100),
  /** Taken from the clinic when empty. */
  country: country.nullish(),
  complaints: optionalText(10_000),
  findings: optionalText(10_000),
  recommendations: optionalText(10_000),
  notes: optionalText(10_000),
  nextVisitOn: day.nullish(),
  /** The language of the original documents: `uk`, `ru`, `pl`, `en`… */
  language: z.string().trim().min(2).max(10).nullish(),
});
export type HealthVisitInput = z.input<typeof healthVisitInputSchema>;

export interface HealthVisit {
  id: string;
  visitedOn: LocalDate;
  clinicId: string | null;
  doctorId: string | null;
  speciality: string | null;
  country: string | null;
  complaints: string | null;
  findings: string | null;
  recommendations: string | null;
  notes: string | null;
  nextVisitOn: LocalDate | null;
  language: string | null;
}

// --- Diagnoses ---

/** Which classification a code is of; clinics in Ukraine write ICD-10-AM. */
export const ICD_SYSTEMS = ['icd10', 'icd10am', 'icd11', 'other'] as const;
export type IcdSystem = (typeof ICD_SYSTEMS)[number];

export const DIAGNOSIS_STATUSES = ['suspected', 'confirmed', 'ruledOut', 'remission'] as const;
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

/** `F41.1`, `F32`, `6A70.1`: kept as written in the document, only its case and spaces fixed. */
export function normalizeIcdCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase();
}

export const healthDiagnosisInputSchema = z.object({
  system: z.enum(ICD_SYSTEMS).default('icd10'),
  code: z
    .string()
    .trim()
    .max(20)
    .transform(normalizeIcdCode)
    .refine((code) => /^[A-Z0-9][A-Z0-9.\-+/]*$/.test(code), 'Not a code')
    .nullish(),
  /** The diagnosis as the document words it. */
  title: z.string().trim().min(1).max(500),
  status: z.enum(DIAGNOSIS_STATUSES).default('confirmed'),
  diagnosedOn: day,
  visitId: z.uuid().nullish(),
  notes: optionalText(5000),
});
export type HealthDiagnosisInput = z.input<typeof healthDiagnosisInputSchema>;

export interface HealthDiagnosis {
  id: string;
  system: IcdSystem;
  code: string | null;
  title: string;
  status: DiagnosisStatus;
  diagnosedOn: LocalDate;
  visitId: string | null;
  notes: string | null;
}

// --- Medications ---

export const healthMedicationInputSchema = z
  .object({
    /** The brand as on the box or in the prescription. */
    name: z.string().trim().min(1).max(200),
    /** The active substance (INN): brands differ between countries, the substance does not. */
    substance: optionalText(200),
    dose: optionalText(200),
    schedule: optionalText(500),
    startedOn: day.nullish(),
    /** `null` — still taken. */
    stoppedOn: day.nullish(),
    stopReason: optionalText(1000),
    visitId: z.uuid().nullish(),
    notes: optionalText(5000),
  })
  .refine((m) => !m.stoppedOn || !m.startedOn || m.stoppedOn >= m.startedOn, {
    message: 'The end is before the start',
    path: ['stoppedOn'],
  });
export type HealthMedicationInput = z.input<typeof healthMedicationInputSchema>;

export interface HealthMedication {
  id: string;
  name: string;
  substance: string | null;
  dose: string | null;
  schedule: string | null;
  startedOn: LocalDate | null;
  stoppedOn: LocalDate | null;
  stopReason: string | null;
  visitId: string | null;
  notes: string | null;
}

// --- Documents ---

export const HEALTH_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const HEALTH_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const HEALTH_DOCUMENT_KINDS = [
  'consultation',
  'prescription',
  'labResults',
  'study',
  'discharge',
  'certificate',
  'other',
] as const;
export type HealthDocumentKind = (typeof HEALTH_DOCUMENT_KINDS)[number];

/** The fields sent with the file (multipart) and when it is changed later. */
export const healthDocumentInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(HEALTH_DOCUMENT_KINDS).default('other'),
  documentedOn: day.nullish(),
  visitId: z.uuid().nullish(),
});
export type HealthDocumentInput = z.input<typeof healthDocumentInputSchema>;

export interface HealthDocument {
  id: string;
  name: string;
  kind: HealthDocumentKind;
  documentedOn: LocalDate | null;
  visitId: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
}

/** Everything at once: a history of one person is small, the page filters it itself. */
export interface HealthRecord {
  clinics: HealthClinic[];
  doctors: HealthDoctor[];
  /** The latest first. */
  visits: HealthVisit[];
  diagnoses: HealthDiagnosis[];
  medications: HealthMedication[];
  documents: HealthDocument[];
}

// --- The ICD dictionary (loaded from WHO by the user, never shipped: see docs/health.md) ---

/** What can be loaded; each is downloaded by the server from its publisher. */
export const ICD_SOURCES = ['who-icd10-en'] as const;
export type IcdSource = (typeof ICD_SOURCES)[number];

export const icdLoadSchema = z.object({
  source: z.enum(ICD_SOURCES),
  /** The user has read and accepted the terms of the publisher. */
  acceptTerms: z.literal(true),
});
export type IcdLoadInput = z.input<typeof icdLoadSchema>;

export interface IcdDictionary {
  system: IcdSystem;
  language: string;
  codes: number;
}

export const icdSearchSchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type IcdSearchQuery = z.output<typeof icdSearchSchema>;

export interface IcdEntry {
  system: IcdSystem;
  code: string;
  language: string;
  title: string;
}
