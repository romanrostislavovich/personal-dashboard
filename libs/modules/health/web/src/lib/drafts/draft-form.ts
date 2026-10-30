import {NonNullableFormBuilder, Validators} from '@angular/forms';
import {
  DiagnosisStatus,
  guessAnalyte,
  HEALTH_SPECIALITIES,
  HealthClinic,
  HealthDocumentDraft,
  HealthDoctor,
  HealthDraftApplyInput,
  HealthDraftKind,
  HealthStudyKind,
  normalizeIcdCode,
  parseLabRange,
  parseLabResult,
} from '@pd/contracts';
import {withDefaults} from '@pd/web-core';

/** The value of the clinic / doctor select that makes a new one by the typed name. */
export const NEW = '__new__';

/** The form of a draft read out of a document, for the user to check. */
export function draftForm(
  fb: NonNullableFormBuilder,
  draft: HealthDocumentDraft,
  known: {clinics: HealthClinic[]; doctors: HealthDoctor[]},
  today: string,
) {
  const clinic = match(known.clinics, draft.clinic ?? draft.laboratory);
  const doctor = match(known.doctors, draft.doctor);
  // The draft's plain texts, empty where the document said nothing.
  const texts = withDefaults(draft, {
    country: '',
    language: '',
    complaints: '',
    findings: '',
    recommendations: '',
    nextVisitOn: '',
    studyArea: '',
    conclusion: '',
  });
  return fb.group({
    ...texts,
    kind: fb.control<HealthDraftKind>(draft.kind),
    day: [draft.day ?? today, Validators.required],
    clinicId: clinic?.id ?? (draft.clinic ? NEW : ''),
    clinicName: draft.clinic ?? '',
    doctorId: doctor?.id ?? (draft.doctor ? NEW : ''),
    doctorName: draft.doctor ?? '',
    speciality: speciality(draft.speciality) ?? doctor?.speciality ?? '',
    diagnoses: fb.array(
      draft.diagnoses.map(d =>
        diagnosisLine(fb, {
          code: d.code ?? '',
          title: d.title,
          status: d.status,
        }),
      ),
    ),
    medications: fb.array(
      draft.medications.map(m =>
        medicationLine(fb, {
          name: m.name,
          substance: m.substance ?? '',
          dose: m.dose ?? '',
          schedule: m.schedule ?? '',
        }),
      ),
    ),
    laboratory: draft.laboratory ?? draft.clinic ?? '',
    labValues: fb.array(
      draft.labValues.map(v =>
        labLine(fb, {
          name: v.name,
          result: v.result,
          unit: v.unit ?? '',
          range: v.range ?? '',
        }),
      ),
    ),
    studyKind: fb.control<HealthStudyKind>(draft.studyKind ?? 'other'),
  });
}

export type DraftForm = ReturnType<typeof draftForm>;

export function diagnosisLine(
  fb: NonNullableFormBuilder,
  value = {code: '', title: '', status: 'confirmed' as DiagnosisStatus},
) {
  return fb.group({
    code: value.code,
    title: [value.title, Validators.required],
    status: fb.control<DiagnosisStatus>(value.status),
  });
}

export function medicationLine(
  fb: NonNullableFormBuilder,
  value = {name: '', substance: '', dose: '', schedule: ''},
) {
  return fb.group({
    name: [value.name, Validators.required],
    substance: value.substance,
    dose: value.dose,
    schedule: value.schedule,
  });
}

export function labLine(
  fb: NonNullableFormBuilder,
  value = {name: '', result: '', unit: '', range: ''},
) {
  return fb.group({
    name: [value.name, Validators.required],
    result: [value.result, Validators.required],
    unit: value.unit,
    range: value.range,
  });
}

/**
 * What is saved: the part of the kind the user settled on, and the diagnoses and medications
 * with any kind but "other" — a lab report or a study may name them too.
 */
export function toApplyInput(
  documentId: string,
  form: DraftForm,
): HealthDraftApplyInput {
  const v = form.getRawValue();
  const country = v.country || null;
  const base: HealthDraftApplyInput =
    v.kind === 'other' ? {documentId} : {documentId, ...prescribed(v)};
  switch (v.kind) {
    case 'visit':
      return {
        ...base,
        ...place(v),
        visit: {
          visitedOn: v.day,
          country,
          speciality: v.speciality || null,
          language: v.language || null,
          complaints: v.complaints || null,
          findings: v.findings || null,
          recommendations: v.recommendations || null,
          nextVisitOn: v.nextVisitOn || null,
        },
        // The results a visit lists become a lab report of that visit.
        labPanel: v.labValues.length ? labPanel(v) : null,
      };
    case 'labs':
      return {...base, labPanel: labPanel(v)};
    case 'study':
      return {
        ...base,
        study: {
          kind: v.studyKind,
          area: v.studyArea || null,
          performedOn: v.day,
          conclusion: v.conclusion || null,
        },
      };
    default:
      return base;
  }
}

/** The lab results of the document as one report, taken on its day. */
function labPanel(
  v: ReturnType<DraftForm['getRawValue']>,
): HealthDraftApplyInput['labPanel'] {
  return {
    takenOn: v.day,
    laboratory: v.laboratory || null,
    country: v.country || null,
    values: v.labValues.map(line => ({
      name: line.name.trim(),
      analyte: guessAnalyte(line.name) ?? null,
      unit: line.unit || null,
      ...parseLabResult(line.result),
      ...parseLabRange(line.range),
    })),
  };
}

/** The diagnoses and the medications of the document, from its day. */
function prescribed(
  v: ReturnType<DraftForm['getRawValue']>,
): Pick<HealthDraftApplyInput, 'diagnoses' | 'medications'> {
  return {
    diagnoses: v.diagnoses.map(d => ({
      system: 'icd10',
      code: d.code ? normalizeIcdCode(d.code) : null,
      title: d.title.trim(),
      status: d.status,
      diagnosedOn: v.day,
    })),
    medications: v.medications.map(m => ({
      name: m.name.trim(),
      substance: m.substance || null,
      dose: m.dose || null,
      schedule: m.schedule || null,
      startedOn: v.day,
    })),
  };
}

/** The clinic and the doctor: one already known, or a new one by the name in the document. */
function place(
  v: ReturnType<DraftForm['getRawValue']>,
): Partial<HealthDraftApplyInput> {
  const country = v.country || null;
  return {
    clinicId: v.clinicId && v.clinicId !== NEW ? v.clinicId : null,
    newClinic:
      v.clinicId === NEW && v.clinicName.trim()
        ? {name: v.clinicName.trim(), country}
        : null,
    doctorId: v.doctorId && v.doctorId !== NEW ? v.doctorId : null,
    newDoctor:
      v.doctorId === NEW && v.doctorName.trim()
        ? {name: v.doctorName.trim(), speciality: v.speciality || null}
        : null,
  };
}

/** One known by a name that contains the other (`Medicover`, `Medicover Warszawa`). */
function match<T extends {name: string}>(
  items: T[],
  name: string | null | undefined,
): T | undefined {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) {
    return undefined;
  }
  return items.find(item => {
    const known = item.name.trim().toLowerCase();
    return known === wanted || known.includes(wanted) || wanted.includes(known);
  });
}

/** A speciality of the list as is; one the AI wrote in words is kept as written. */
function speciality(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const key = value.trim().toLowerCase();
  return (HEALTH_SPECIALITIES as readonly string[]).includes(key)
    ? key
    : value.trim();
}
