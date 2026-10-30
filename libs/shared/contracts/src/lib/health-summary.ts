import {z} from 'zod';
import {
  AllergySeverity,
  BloodType,
  DiagnosisStatus,
  HealthLabPanel,
  HealthRecord,
  healthConditions,
  HealthStudyKind,
  IcdSystem,
  labSeries,
} from './health';
import {LabFlag} from './health-labs';
import {LocalDate} from './local-date';

/**
 * A summary of one's medical history for a new doctor: what is going on now, what is taken,
 * the latest results and the history of visits — in the doctor's language, the codes as they
 * are. The user picks what goes in (no psychiatry for a dentist). It is made of the history
 * only: nothing is added or interpreted.
 */

/** The languages a summary is written in; the headings are ours, the texts are translated. */
export const SUMMARY_LANGUAGES = ['en', 'pl', 'uk', 'ru', 'de'] as const;
export type SummaryLanguage = (typeof SUMMARY_LANGUAGES)[number];

export const healthSummaryOptionsSchema = z.object({
  language: z.enum(SUMMARY_LANGUAGES).default('en'),
  /** The free texts (diagnoses, recommendations, conclusions) translated by the AI. */
  translate: z.boolean().default(false),
  /** The blood type, allergies, operations and vaccinations. */
  profile: z.boolean().default(true),
  conditions: z.boolean().default(true),
  /** Conditions resolved, ruled out or in remission too. */
  pastConditions: z.boolean().default(false),
  medications: z.boolean().default(true),
  pastMedications: z.boolean().default(false),
  labs: z.boolean().default(true),
  studies: z.boolean().default(true),
  visits: z.boolean().default(true),
  /** The complaints, examination and recommendations of each visit, not only its date. */
  visitTexts: z.boolean().default(false),
  /** Specialities left out entirely: their visits, and what was diagnosed or prescribed there. */
  excludeSpecialities: z
    .array(z.string().trim().min(1).max(100))
    .max(30)
    .default([]),
  /** Visits, results and studies from this day on; `null` — the whole history. */
  from: z.iso.date().nullish(),
});
export type HealthSummaryOptions = z.output<typeof healthSummaryOptionsSchema>;
export type HealthSummaryOptionsInput = z.input<
  typeof healthSummaryOptionsSchema
>;

export interface SummaryProfile {
  bloodType: BloodType | null;
  allergies: {
    substance: string;
    reaction: string | null;
    severity: AllergySeverity | null;
  }[];
  operations: {title: string; performedOn: LocalDate}[];
  vaccinations: {vaccine: string; dose: string | null; givenOn: LocalDate}[];
}

export interface SummaryCondition {
  system: IcdSystem;
  code: string | null;
  title: string;
  status: DiagnosisStatus;
  firstOn: LocalDate;
  lastOn: LocalDate;
}

export interface SummaryMedication {
  name: string;
  substance: string | null;
  dose: string | null;
  schedule: string | null;
  startedOn: LocalDate | null;
  stoppedOn: LocalDate | null;
  stopReason: string | null;
}

export interface SummaryLabResult {
  name: string;
  /** The latest value in the analyte's unit (or as the laboratory gave it). */
  value: number;
  unit: string;
  low: number | null;
  high: number | null;
  flag: LabFlag;
  day: LocalDate;
  /** The values before it, the oldest first, for the trend. */
  earlier: {day: LocalDate; value: number}[];
}

export interface SummaryStudy {
  kind: HealthStudyKind;
  area: string | null;
  performedOn: LocalDate;
  conclusion: string | null;
}

export interface SummaryVisit {
  visitedOn: LocalDate;
  country: string | null;
  speciality: string | null;
  clinic: string | null;
  doctor: string | null;
  diagnoses: string[];
  complaints: string | null;
  findings: string | null;
  recommendations: string | null;
}

export interface HealthSummary {
  language: SummaryLanguage;
  /** Whose history it is. */
  patient: string;
  madeOn: LocalDate;
  /** `null` — the whole history. */
  from: LocalDate | null;
  /** The free texts were translated by the AI (the summary says so). */
  translated: boolean;
  /** `null` — the section was not asked for. */
  profile: SummaryProfile | null;
  conditions: SummaryCondition[] | null;
  medications: SummaryMedication[] | null;
  labs: SummaryLabResult[] | null;
  studies: SummaryStudy[] | null;
  visits: SummaryVisit[] | null;
}

/** How many earlier values of a result are shown for its trend. */
const EARLIER_VALUES = 4;

/** The summary out of the history and the options; the texts are as written (not translated). */
export function buildHealthSummary(
  record: HealthRecord,
  options: HealthSummaryOptions,
  context: {patient: string; today: LocalDate},
): HealthSummary {
  const excluded = new Set(options.excludeSpecialities);
  const from = options.from ?? null;
  const inPeriod = (day: string | null) =>
    !from || (day !== null && day >= from);
  // A visit of an excluded speciality takes along what was diagnosed or prescribed at it.
  const hiddenVisits = new Set(
    record.visits
      .filter(v => v.speciality && excluded.has(v.speciality))
      .map(v => v.id),
  );
  const shown = (item: {visitId: string | null}) =>
    !item.visitId || !hiddenVisits.has(item.visitId);

  const conditions = healthConditions(record.diagnoses.filter(shown))
    .filter(
      c =>
        options.pastConditions ||
        c.status === 'confirmed' ||
        c.status === 'suspected',
    )
    .map(({system, code, title, status, firstOn, lastOn}) => ({
      system,
      code,
      title,
      status,
      firstOn,
      lastOn,
    }));

  const medications = record.medications
    .filter(shown)
    .filter(m => options.pastMedications || !m.stoppedOn)
    .map(
      ({
        name,
        substance,
        dose,
        schedule,
        startedOn,
        stoppedOn,
        stopReason,
      }) => ({
        name,
        substance,
        dose,
        schedule,
        startedOn,
        stoppedOn,
        stopReason,
      }),
    );

  const panels: HealthLabPanel[] = record.labPanels.filter(
    panel => shown(panel) && inPeriod(panel.takenOn),
  );
  const labs = labSeries(panels).map(series => {
    const latest = series.points[series.points.length - 1];
    return {
      name: series.name,
      value: latest.value,
      unit: series.unit,
      low: latest.low,
      high: latest.high,
      flag: latest.flag,
      day: latest.day,
      earlier: series.points
        .slice(0, -1)
        .slice(-EARLIER_VALUES)
        .map(({day, value}) => ({day, value})),
    };
  });

  const studies = record.studies
    .filter(s => shown(s) && inPeriod(s.performedOn))
    .map(({kind, area, performedOn, conclusion}) => ({
      kind,
      area,
      performedOn,
      conclusion,
    }));

  const name = <T extends {id: string; name: string}>(
    items: T[],
    id: string | null,
  ) => items.find(item => item.id === id)?.name ?? null;
  const visits = record.visits
    .filter(v => !hiddenVisits.has(v.id) && inPeriod(v.visitedOn))
    .map(visit => ({
      visitedOn: visit.visitedOn,
      country: visit.country,
      speciality: visit.speciality,
      clinic: name(record.clinics, visit.clinicId),
      doctor: name(record.doctors, visit.doctorId),
      diagnoses: record.diagnoses
        .filter(d => d.visitId === visit.id)
        .map(d => (d.code ? `${d.code} ${d.title}` : d.title)),
      complaints: options.visitTexts ? visit.complaints : null,
      findings: options.visitTexts ? visit.findings : null,
      recommendations: options.visitTexts ? visit.recommendations : null,
    }));

  return {
    language: options.language,
    patient: context.patient,
    madeOn: context.today,
    from,
    translated: false,
    profile: options.profile
      ? {
          bloodType: record.profile.bloodType,
          allergies: record.profile.allergies.map(
            ({substance, reaction, severity}) => ({
              substance,
              reaction,
              severity,
            }),
          ),
          operations: record.profile.operations.map(({title, performedOn}) => ({
            title,
            performedOn,
          })),
          vaccinations: record.profile.vaccinations.map(
            ({vaccine, dose, givenOn}) => ({
              vaccine,
              dose,
              givenOn,
            }),
          ),
        }
      : null,
    conditions: options.conditions ? conditions : null,
    medications: options.medications ? medications : null,
    labs: options.labs ? labs : null,
    studies: options.studies ? studies : null,
    visits: options.visits ? visits : null,
  };
}

// --- A link for a doctor ---

export const SHARE_DAYS = [1, 3, 7, 30] as const;

export const healthShareInputSchema = z.object({
  options: healthSummaryOptionsSchema,
  days: z
    .union([z.literal(1), z.literal(3), z.literal(7), z.literal(30)])
    .default(3),
  /** Whom it is for, to tell the links apart: "Dr. Kowalska, Medicover". */
  note: z.string().trim().max(200).nullish(),
});
export type HealthShareInput = z.input<typeof healthShareInputSchema>;

export interface HealthShare {
  id: string;
  note: string | null;
  language: SummaryLanguage;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** How many times the link was opened, and the last time. */
  opened: number;
  lastOpenedAt: string | null;
}

/** A new link: its address is shown once, only its hash is kept. */
export interface HealthShareCreated {
  share: HealthShare;
  url: string;
}
