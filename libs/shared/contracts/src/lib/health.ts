import { z } from 'zod';
import { CanonicalValue, LabFlag } from './health-labs';
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
  /** The AI has read it and the draft waits to be checked (see HealthDocumentDraft). */
  hasDraft: boolean;
  createdAt: string;
}

// --- Lab results ---

const labNumber = z.number().finite();

/** One line of a lab report: an analyte, its value and the laboratory's own range. */
export const healthLabValueInputSchema = z
  .object({
    /** As the report names it: `Глюкоза`, `GLU`, `Glukoza`. */
    name: z.string().trim().min(1).max(200),
    /** A key of LAB_ANALYTES when it is one of them (see guessAnalyte). */
    analyte: z.string().trim().max(50).nullish(),
    value: labNumber.nullish(),
    /** A result that is not a number: `negative`, `<0.5`, `не обнаружено`. */
    textValue: optionalText(200),
    unit: optionalText(30),
    refLow: labNumber.nullish(),
    refHigh: labNumber.nullish(),
    /** A range that is not two numbers: `negative`, `<5.2`. */
    refText: optionalText(200),
  })
  .refine((line) => line.value != null || Boolean(line.textValue), {
    message: 'A value or a text result is needed',
    path: ['value'],
  });
export type HealthLabValueInput = z.input<typeof healthLabValueInputSchema>;

export const healthLabPanelInputSchema = z.object({
  takenOn: day,
  laboratory: optionalText(200),
  country: country.nullish(),
  visitId: z.uuid().nullish(),
  /** The report itself, among the documents. */
  documentId: z.uuid().nullish(),
  notes: optionalText(5000),
  values: z.array(healthLabValueInputSchema).min(1).max(300),
});
export type HealthLabPanelInput = z.input<typeof healthLabPanelInputSchema>;

export interface HealthLabValue {
  id: string;
  name: string;
  analyte: string | null;
  value: number | null;
  textValue: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  /** Out of the laboratory's own range. */
  flag: LabFlag;
  /** In the analyte's own unit, for one chart across laboratories; `null` — as it is. */
  canonical: CanonicalValue | null;
}

export interface HealthLabPanel {
  id: string;
  takenOn: LocalDate;
  laboratory: string | null;
  country: string | null;
  visitId: string | null;
  documentId: string | null;
  notes: string | null;
  values: HealthLabValue[];
}

// --- Studies: ultrasound, MRI, ECG… as their conclusions ---

export const HEALTH_STUDY_KINDS = [
  'ultrasound',
  'mri',
  'ct',
  'xray',
  'ecg',
  'eeg',
  'endoscopy',
  'other',
] as const;
export type HealthStudyKind = (typeof HEALTH_STUDY_KINDS)[number];

export const healthStudyInputSchema = z.object({
  kind: z.enum(HEALTH_STUDY_KINDS),
  /** What was examined: `thyroid`, `brain`, `abdomen`. */
  area: optionalText(200),
  performedOn: day,
  conclusion: optionalText(10_000),
  visitId: z.uuid().nullish(),
  documentId: z.uuid().nullish(),
  notes: optionalText(5000),
});
export type HealthStudyInput = z.input<typeof healthStudyInputSchema>;

export interface HealthStudy {
  id: string;
  kind: HealthStudyKind;
  area: string | null;
  performedOn: LocalDate;
  conclusion: string | null;
  visitId: string | null;
  documentId: string | null;
  notes: string | null;
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
  /** The latest first. */
  labPanels: HealthLabPanel[];
  /** The latest first. */
  studies: HealthStudy[];
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

/** The languages of a dictionary; the ones WHO does not give come from a file of the user's. */
export const ICD_LANGUAGES = ['uk', 'ru', 'pl', 'en'] as const;

export const ICD_FILE_MAX_BYTES = 30 * 1024 * 1024;

/**
 * A dictionary from a file the user downloaded themselves (CSV or XLSX with a column of codes
 * and one of titles): the Russian ICD-10 of the Ministry of Health, the Ukrainian НК 025…
 * It replaces what was loaded for the same classification and language.
 */
export const icdImportSchema = z.object({
  system: z.enum(['icd10', 'icd10am', 'icd11']),
  language: z.enum(ICD_LANGUAGES),
});
export type IcdImportInput = z.input<typeof icdImportSchema>;

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

// --- Conditions: the diagnoses of one code over the years ---

/** One condition across clinics and countries: every diagnosis of its code, the latest first. */
export interface HealthCondition {
  /** `icd10:F41.1`, or `title:<title>` for a diagnosis written without a code. */
  key: string;
  system: IcdSystem;
  code: string | null;
  /** The wording of the latest diagnosis. */
  title: string;
  /** The status of the latest diagnosis. */
  status: DiagnosisStatus;
  firstOn: LocalDate;
  lastOn: LocalDate;
  diagnoses: HealthDiagnosis[];
}

/**
 * The diagnoses grouped by their code (a diagnosis without one by its wording), the condition
 * diagnosed last first. A condition still confirmed or suspected leads its period.
 */
export function healthConditions(diagnoses: readonly HealthDiagnosis[]): HealthCondition[] {
  const groups = new Map<string, HealthDiagnosis[]>();
  for (const diagnosis of diagnoses) {
    const key = diagnosis.code
      ? `${diagnosis.system}:${diagnosis.code}`
      : `title:${diagnosis.title.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), diagnosis]);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((a, b) => b.diagnosedOn.localeCompare(a.diagnosedOn));
      const latest = sorted[0];
      return {
        key,
        system: latest.system,
        code: latest.code,
        title: latest.title,
        status: latest.status,
        firstOn: sorted[sorted.length - 1].diagnosedOn,
        lastOn: latest.diagnosedOn,
        diagnoses: sorted,
      };
    })
    .sort(
      (a, b) =>
        Number(isActive(b.status)) - Number(isActive(a.status)) || b.lastOn.localeCompare(a.lastOn),
    );
}

const isActive = (status: DiagnosisStatus) => status === 'confirmed' || status === 'suspected';

// --- Lab series: one analyte over the years, for a chart ---

export interface LabPoint {
  day: LocalDate;
  value: number;
  /** The laboratory's range in the unit of the series. */
  low: number | null;
  high: number | null;
  flag: LabFlag;
  laboratory: string | null;
  country: string | null;
  panelId: string;
}

export interface LabSeries {
  /** `analyte:glucose`, or `name:<name>|<unit>` for one that is not in LAB_ANALYTES. */
  key: string;
  analyte: string | null;
  /** As the latest report names it. */
  name: string;
  unit: string;
  /** The oldest first. */
  points: LabPoint[];
}

/**
 * Every numeric value, gathered by analyte across laboratories and countries in the analyte's
 * own unit; one we do not know, or in a unit we cannot convert, is its own series by its name
 * and unit. The series whose latest value is out of range come first, then by name.
 */
export function labSeries(panels: readonly HealthLabPanel[]): LabSeries[] {
  const series = new Map<string, LabSeries>();
  const byDay = [...panels].sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  for (const panel of byDay) {
    for (const line of panel.values) {
      if (line.value === null) {
        continue;
      }
      const canonical = line.canonical;
      const unit = canonical?.unit ?? line.unit ?? '';
      const key = canonical
        ? `analyte:${line.analyte}`
        : `name:${line.name.trim().toLowerCase()}|${unit.toLowerCase()}`;
      const entry = series.get(key) ?? {
        key,
        analyte: canonical ? line.analyte : null,
        name: line.name,
        unit,
        points: [],
      };
      entry.name = line.name;
      entry.points.push({
        day: panel.takenOn,
        value: canonical?.value ?? line.value,
        low: canonical ? canonical.low : line.refLow,
        high: canonical ? canonical.high : line.refHigh,
        flag: line.flag,
        laboratory: panel.laboratory,
        country: panel.country,
        panelId: panel.id,
      });
      series.set(key, entry);
    }
  }
  const flagged = (s: LabSeries) => Number(s.points[s.points.length - 1].flag !== null);
  return [...series.values()].sort(
    (a, b) => flagged(b) - flagged(a) || a.name.localeCompare(b.name),
  );
}

// --- A document read by the AI: a draft the user checks before anything is saved ---

/** What a document turned out to be. */
export const HEALTH_DRAFT_KINDS = ['visit', 'labs', 'study', 'other'] as const;
export type HealthDraftKind = (typeof HEALTH_DRAFT_KINDS)[number];

const draftText = (max: number) => z.string().trim().max(max).nullish().catch(null);
const draftDay = z.iso.date().nullish().catch(null);

/**
 * A draft read out of a document: everything is optional, and anything the AI got wrong is
 * dropped rather than refused (`catch`), so a half-read document still gives a half-filled
 * form. The user corrects it and saves it (`healthDraftApplySchema`).
 */
export const healthDocumentDraftSchema = z.object({
  kind: z.enum(HEALTH_DRAFT_KINDS).catch('other'),
  /** The language of the document: `uk`, `ru`, `pl`, `en`. */
  language: draftText(10),
  day: draftDay,
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((code) => code.toUpperCase())
    .nullish()
    .catch(null),
  clinic: draftText(200),
  doctor: draftText(200),
  speciality: draftText(100),
  complaints: draftText(10_000),
  findings: draftText(10_000),
  recommendations: draftText(10_000),
  nextVisitOn: draftDay,
  diagnoses: z
    .array(
      z.object({
        code: draftText(20),
        // An empty one is dropped after (see parseDraft), not the whole list.
        title: z.string().trim().max(500).catch(''),
        status: z.enum(DIAGNOSIS_STATUSES).catch('confirmed'),
      }),
    )
    .max(30)
    .catch([]),
  medications: z
    .array(
      z.object({
        name: z.string().trim().max(200).catch(''),
        substance: draftText(200),
        dose: draftText(200),
        schedule: draftText(500),
      }),
    )
    .max(30)
    .catch([]),
  laboratory: draftText(200),
  labValues: z
    .array(
      z.object({
        name: z.string().trim().max(200).catch(''),
        /** As printed: `5,6`, `отрицательно`. */
        result: z
          .union([z.string(), z.number()])
          .transform((value) => String(value).trim().slice(0, 200))
          .catch(''),
        unit: draftText(30),
        /** As printed: `3,9–5,5`, `<5.2`. */
        range: draftText(200),
      }),
    )
    .max(300)
    .catch([]),
  studyKind: z.enum(HEALTH_STUDY_KINDS).nullish().catch(null),
  studyArea: draftText(200),
  conclusion: draftText(10_000),
});
export type HealthDocumentDraft = z.output<typeof healthDocumentDraftSchema>;

/**
 * Saves a checked draft at once: the clinic and the doctor (an existing one by id, or a new one
 * by name), then a visit with its diagnoses and medications, a lab report or a study; the
 * document is attached to what was made.
 */
export const healthDraftApplySchema = z.object({
  documentId: z.uuid(),
  clinicId: z.uuid().nullish(),
  newClinic: healthClinicInputSchema.nullish(),
  doctorId: z.uuid().nullish(),
  newDoctor: healthDoctorInputSchema.omit({ clinicId: true }).nullish(),
  visit: healthVisitInputSchema.omit({ clinicId: true, doctorId: true }).nullish(),
  diagnoses: z
    .array(healthDiagnosisInputSchema.omit({ visitId: true }))
    .max(30)
    .default([]),
  medications: z.array(healthMedicationInputSchema).max(30).default([]),
  labPanel: healthLabPanelInputSchema.omit({ visitId: true, documentId: true }).nullish(),
  study: healthStudyInputSchema.omit({ visitId: true, documentId: true }).nullish(),
});
export type HealthDraftApplyInput = z.input<typeof healthDraftApplySchema>;

/** What a saved draft made. */
export interface HealthDraftApplied {
  visitId: string | null;
  labPanelId: string | null;
  studyId: string | null;
}
