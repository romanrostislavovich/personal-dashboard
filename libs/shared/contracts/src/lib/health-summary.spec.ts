import {HealthLabValue, HealthRecord} from './health';
import {buildHealthSummary, healthSummaryOptionsSchema} from './health-summary';

const glucose = (
  value: number,
  flag: HealthLabValue['flag'] = null,
): HealthLabValue => ({
  id: String(value),
  name: 'Glucose',
  analyte: 'glucose',
  value,
  textValue: null,
  unit: 'mmol/L',
  refLow: 3.9,
  refHigh: 5.5,
  refText: null,
  flag,
  canonical: {value, unit: 'mmol/L', low: 3.9, high: 5.5},
});

const record: HealthRecord = {
  clinics: [
    {id: 'c1', name: 'Medicover', country: 'PL', city: null, contacts: null},
  ],
  doctors: [
    {
      id: 'd1',
      name: 'Dr. Nowak',
      speciality: 'psychiatrist',
      clinicId: 'c1',
      contacts: null,
    },
  ],
  visits: [
    visit('v-psy', '2026-10-13', 'psychiatrist', 'd1'),
    visit('v-gp', '2020-05-01', 'general', null),
  ],
  diagnoses: [
    {
      id: 'x1',
      system: 'icd10',
      code: 'F41.1',
      title: 'Anxiety',
      status: 'confirmed',
      diagnosedOn: '2026-10-13',
      visitId: 'v-psy',
      notes: null,
    },
    {
      id: 'x2',
      system: 'icd10',
      code: 'J45',
      title: 'Asthma',
      status: 'remission',
      diagnosedOn: '2015-01-01',
      visitId: null,
      notes: null,
    },
  ],
  medications: [
    medication('m1', 'Escitalopram', 'v-psy', null),
    medication('m2', 'Salbutamol', null, '2018-01-01'),
  ],
  documents: [],
  labPanels: [
    panel('p1', '2019-01-01', [glucose(6.1, 'high')]),
    panel('p2', '2026-09-01', [glucose(5.2)]),
  ],
  studies: [],
  profile: {
    bloodType: 'A+',
    notes: null,
    allergies: [
      {
        id: 'a1',
        substance: 'Penicillin',
        reaction: 'Rash',
        severity: 'severe',
        since: null,
      },
    ],
    vaccinations: [],
    operations: [],
  },
  intakes: [],
};

describe('buildHealthSummary', () => {
  const context = {patient: 'Roman', today: '2026-10-14'};

  it('gives what is going on now by default', () => {
    const summary = buildHealthSummary(
      record,
      healthSummaryOptionsSchema.parse({}),
      context,
    );
    expect(summary.conditions?.map(c => c.code)).toEqual(['F41.1']);
    expect(summary.medications?.map(m => m.name)).toEqual(['Escitalopram']);
    expect(summary.labs?.[0]).toMatchObject({
      value: 5.2,
      flag: null,
      earlier: [{value: 6.1}],
    });
    expect(summary.visits?.map(v => v.visitedOn)).toEqual([
      '2026-10-13',
      '2020-05-01',
    ]);
    expect(summary.profile).toMatchObject({
      bloodType: 'A+',
      allergies: [{substance: 'Penicillin', severity: 'severe'}],
    });
    expect(summary.visits?.[0]).toMatchObject({
      clinic: null,
      doctor: 'Dr. Nowak',
      diagnoses: ['F41.1 Anxiety'],
      recommendations: null,
    });
  });

  it('leaves a speciality out with what was diagnosed and prescribed at it', () => {
    const summary = buildHealthSummary(
      record,
      healthSummaryOptionsSchema.parse({
        excludeSpecialities: ['psychiatrist'],
        pastConditions: true,
        pastMedications: true,
      }),
      context,
    );
    expect(summary.conditions?.map(c => c.code)).toEqual(['J45']);
    expect(summary.medications?.map(m => m.name)).toEqual(['Salbutamol']);
    expect(summary.visits?.map(v => v.speciality)).toEqual(['general']);
  });

  it('keeps to the period and drops the sections not asked for', () => {
    const summary = buildHealthSummary(
      record,
      healthSummaryOptionsSchema.parse({
        from: '2026-01-01',
        studies: false,
        visitTexts: true,
      }),
      context,
    );
    expect(summary.labs?.[0].earlier).toEqual([]);
    expect(summary.visits).toHaveLength(1);
    expect(summary.visits?.[0].recommendations).toBe('Rest');
    expect(summary.studies).toBeNull();
  });
});

function visit(
  id: string,
  visitedOn: string,
  speciality: string,
  doctorId: string | null,
) {
  return {
    id,
    visitedOn,
    clinicId: null,
    doctorId,
    speciality,
    country: 'PL',
    complaints: null,
    findings: null,
    recommendations: 'Rest',
    notes: null,
    nextVisitOn: null,
    language: null,
  };
}

function medication(
  id: string,
  name: string,
  visitId: string | null,
  stoppedOn: string | null,
) {
  return {
    id,
    name,
    substance: null,
    dose: null,
    schedule: null,
    startedOn: null,
    stoppedOn,
    stopReason: null,
    visitId,
    notes: null,
    reminderTimes: [],
  };
}

function panel(id: string, takenOn: string, values: HealthLabValue[]) {
  return {
    id,
    takenOn,
    laboratory: null,
    country: null,
    visitId: null,
    documentId: null,
    notes: null,
    values,
  };
}
