import { HealthRecord } from '@pd/contracts';
import { healthPeriods, labMetrics, visitsMetric } from './health.links';
import { healthHits } from './health.search';

const record: HealthRecord = {
  clinics: [],
  doctors: [],
  visits: [visit('psy', 'psychiatrist'), visit('gp', 'general')],
  diagnoses: [
    diagnosis('F41.1', 'Anxiety', 'confirmed', '2026-10-13'),
    diagnosis('F32.1', 'Depression', 'remission', '2020-01-10'),
    diagnosis('J45', 'Asthma', 'confirmed', '2015-01-01'),
    diagnosis('F43.2', 'Ruled out', 'ruledOut', '2026-01-01'),
  ],
  medications: [
    medication('Escitalopram', 'psy', '2026-10-13', null),
    medication('Salbutamol', 'gp', '2015-01-01', null),
  ],
  documents: [],
  labPanels: [],
  studies: [],
  profile: { bloodType: null, notes: null, allergies: [], vaccinations: [], operations: [] },
  intakes: [],
};

describe('healthPeriods', () => {
  it('tells every period, the treatment of the mind marked, still going on or over', () => {
    const periods = healthPeriods(record, { from: '2019-01-01', to: '2026-12-31' });
    expect(
      periods
        .filter((period) => period.mind)
        .map(({ kind, title, subtitle, from, to }) => ({ kind, title, subtitle, from, to })),
    ).toEqual([
      {
        kind: 'medication',
        title: 'Escitalopram',
        subtitle: '10 mg',
        from: '2026-10-13',
        to: null,
      },
      { kind: 'diagnosis', title: 'F41.1 Anxiety', subtitle: null, from: '2026-10-13', to: null },
      {
        kind: 'diagnosis',
        title: 'F32.1 Depression',
        subtitle: null,
        from: '2020-01-10',
        to: '2020-01-10',
      },
    ]);
  });

  it('tells the rest of the history too, not as the mind', () => {
    const periods = healthPeriods(record, { from: '2019-01-01', to: '2026-12-31' });
    expect(periods.filter((period) => !period.mind).map((period) => period.title)).toEqual([
      'Salbutamol',
      'J45 Asthma',
    ]);
  });

  it('leaves out what does not touch the range', () => {
    expect(
      healthPeriods(record, { from: '2021-01-01', to: '2021-12-31' }).map((p) => p.title),
    ).toEqual(['Salbutamol', 'J45 Asthma']);
    expect(healthPeriods(record, { from: '2010-01-01', to: '2010-12-31' })).toEqual([]);
  });
});

describe('the daily numbers of Health', () => {
  it('counts the visits of a day', () => {
    expect(visitsMetric(record, { from: '2026-01-01', to: '2026-12-31' }).days).toEqual([
      { day: '2026-10-13', value: 2 },
    ]);
  });

  it('makes every analyte a reading, in its canonical unit', () => {
    const value = (name: string, number: number, unit: string, canonical: number | null) => ({
      id: name,
      name,
      analyte: name.toLowerCase(),
      value: number,
      textValue: null,
      unit,
      refLow: null,
      refHigh: null,
      refText: null,
      flag: null,
      canonical:
        canonical === null ? null : { value: canonical, unit: 'nmol/L', low: null, high: null },
    });
    const panel = (takenOn: string, values: ReturnType<typeof value>[]) => ({
      id: takenOn,
      takenOn,
      laboratory: null,
      country: null,
      visitId: null,
      documentId: null,
      notes: null,
      values,
    });
    const metrics = labMetrics(
      {
        ...record,
        labPanels: [
          panel('2026-03-01', [value('Vitamin D', 20, 'ng/mL', 50)]),
          panel('2026-06-01', [value('Vitamin D', 125, 'nmol/L', 125)]),
        ],
      } as never,
      { from: '2026-01-01', to: '2026-12-31' },
    );
    expect(metrics).toEqual([
      expect.objectContaining({
        label: 'Vitamin D (nmol/L)',
        unit: 'score',
        days: [
          { day: '2026-03-01', value: 50 },
          { day: '2026-06-01', value: 125 },
        ],
      }),
    ]);
  });
});

describe('healthHits', () => {
  it('finds a diagnosis by its code and a medication by its substance', () => {
    expect(healthHits(record, 'f41').map((hit) => hit.title)).toEqual(['F41.1 Anxiety']);
    expect(healthHits(record, 'escitalo').map((hit) => hit.kind)).toEqual(['medication']);
  });
});

function visit(id: string, speciality: string) {
  return {
    id,
    visitedOn: '2026-10-13',
    clinicId: null,
    doctorId: null,
    speciality,
    country: 'PL',
    complaints: null,
    findings: null,
    recommendations: null,
    notes: null,
    nextVisitOn: null,
    language: null,
  };
}

function diagnosis(
  code: string,
  title: string,
  status: 'confirmed' | 'remission' | 'ruledOut',
  diagnosedOn: string,
) {
  return {
    id: code,
    system: 'icd10' as const,
    code,
    title,
    status,
    diagnosedOn,
    visitId: null,
    notes: null,
  };
}

function medication(name: string, visitId: string, startedOn: string, stoppedOn: string | null) {
  return {
    id: name,
    name,
    substance: name.toLowerCase(),
    dose: '10 mg',
    schedule: null,
    startedOn,
    stoppedOn,
    stopReason: null,
    visitId,
    notes: null,
    reminderTimes: [],
  };
}
