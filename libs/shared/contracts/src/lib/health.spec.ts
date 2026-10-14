import {
  HealthDiagnosis,
  healthConditions,
  healthDiagnosisInputSchema,
  HealthLabPanel,
  HealthLabValue,
  labSeries,
  parseReminderTimes,
} from './health';
import {
  formatLabRange,
  guessAnalyte,
  labFlag,
  looseUnit,
  parseLabRange,
  parseLabResult,
  toCanonical,
} from './health-labs';

const diagnosis = (over: Partial<HealthDiagnosis>): HealthDiagnosis => ({
  id: Math.random().toString(),
  system: 'icd10',
  code: 'F41.1',
  title: 'Generalized anxiety disorder',
  status: 'confirmed',
  diagnosedOn: '2026-10-13',
  visitId: null,
  notes: null,
  ...over,
});

describe('healthConditions', () => {
  it('makes one condition of a code from several clinics, with its first and last days', () => {
    const [condition] = healthConditions([
      diagnosis({ diagnosedOn: '2019-03-01', title: 'Генерализованное тревожное расстройство' }),
      diagnosis({ diagnosedOn: '2026-10-13', title: 'Zaburzenie lękowe uogólnione' }),
      diagnosis({ diagnosedOn: '2021-06-10', status: 'remission' }),
    ]);
    expect(condition.key).toBe('icd10:F41.1');
    expect(condition.firstOn).toBe('2019-03-01');
    expect(condition.lastOn).toBe('2026-10-13');
    expect(condition.title).toBe('Zaburzenie lękowe uogólnione');
    expect(condition.diagnoses.map((d) => d.diagnosedOn)).toEqual([
      '2026-10-13',
      '2021-06-10',
      '2019-03-01',
    ]);
  });

  it('groups a diagnosis without a code by its wording', () => {
    const conditions = healthConditions([
      diagnosis({ code: null, title: 'Migraine ' }),
      diagnosis({ code: null, title: 'migraine' }),
    ]);
    expect(conditions).toHaveLength(1);
    expect(conditions[0].key).toBe('title:migraine');
  });

  it('puts what is still going on first', () => {
    const conditions = healthConditions([
      diagnosis({ code: 'J45', status: 'remission', diagnosedOn: '2026-01-01' }),
      diagnosis({ code: 'F41.1', status: 'confirmed', diagnosedOn: '2020-01-01' }),
    ]);
    expect(conditions.map((c) => c.code)).toEqual(['F41.1', 'J45']);
  });
});

describe('healthDiagnosisInputSchema', () => {
  it('keeps a code as written, its case and spaces fixed', () => {
    const input = healthDiagnosisInputSchema.parse({
      code: ' f41. 1 ',
      title: 'Anxiety',
      diagnosedOn: '2026-10-13',
    });
    expect(input.code).toBe('F41.1');
    expect(input.system).toBe('icd10');
  });

  it('refuses what is not a code', () => {
    expect(
      healthDiagnosisInputSchema.safeParse({ code: 'F41;1', title: 'x', diagnosedOn: '2026-10-13' })
        .success,
    ).toBe(false);
  });
});

describe('lab analytes', () => {
  it('knows an analyte by its name in any of the languages', () => {
    expect(guessAnalyte('Глюкоза')).toBe('glucose');
    expect(guessAnalyte('GLU')).toBe('glucose');
    expect(guessAnalyte('Glukoza (surowica)')).toBe('glucose');
    expect(guessAnalyte('Тиреотропний гормон')).toBe('tsh');
    expect(guessAnalyte('Холестерин ЛПНП')).toBe('ldl');
    expect(guessAnalyte('Something else')).toBeUndefined();
  });

  it('reads a unit however a lab spells it', () => {
    expect(looseUnit('ммоль/л')).toBe(looseUnit('mmol/L'));
    expect(looseUnit('мкмоль/л')).toBe(looseUnit('µmol/L'));
    expect(looseUnit('tys/µl')).toBe(looseUnit('10^3/uL'));
    expect(looseUnit('×10⁹/л')).toBe(looseUnit('10^9/L'));
    expect(looseUnit('мМЕ/л')).toBe(looseUnit('mIU/L'));
  });

  it('converts a value and its range into the unit of the analyte', () => {
    expect(toCanonical('glucose', 99, 'mg/dL', { low: 70, high: 99 })).toEqual({
      value: 5.495,
      unit: 'mmol/L',
      low: 3.885,
      high: 5.495,
    });
    expect(toCanonical('glucose', 5.1, 'ммоль/л')?.value).toBe(5.1);
    expect(toCanonical('vitaminD', 75, 'nmol/L')?.value).toBe(30.05);
    expect(toCanonical('hba1c', 48, 'mmol/mol')?.value).toBe(6.543);
    expect(toCanonical('glucose', 5, 'furlongs')).toBeNull();
    expect(toCanonical(null, 5, 'mmol/L')).toBeNull();
  });

  it('flags only by the range of the laboratory', () => {
    expect(labFlag(6.1, 3.9, 5.5)).toBe('high');
    expect(labFlag(3.1, 3.9, null)).toBe('low');
    expect(labFlag(5, null, null)).toBeNull();
  });
});

describe('labSeries', () => {
  const line = (over: Partial<HealthLabValue>): HealthLabValue => ({
    id: 'v',
    name: 'Глюкоза',
    analyte: 'glucose',
    value: 5,
    textValue: null,
    unit: 'mmol/L',
    refLow: 3.9,
    refHigh: 5.5,
    refText: null,
    flag: null,
    canonical: { value: 5, unit: 'mmol/L', low: 3.9, high: 5.5 },
    ...over,
  });
  const panel = (id: string, takenOn: string, values: HealthLabValue[]): HealthLabPanel => ({
    id,
    takenOn,
    laboratory: null,
    country: null,
    visitId: null,
    documentId: null,
    notes: null,
    values,
  });

  it('puts one analyte from two countries on one line, the oldest first', () => {
    const [glucose, other] = labSeries([
      panel('pl', '2026-09-01', [
        line({
          name: 'Glukoza',
          value: 99,
          unit: 'mg/dL',
          flag: null,
          canonical: { value: 5.495, unit: 'mmol/L', low: 3.885, high: 5.495 },
        }),
        line({ name: 'Unknown', analyte: null, canonical: null, unit: 'x', value: 1 }),
      ]),
      panel('ua', '2021-03-01', [
        line({
          value: 6.2,
          flag: 'high',
          canonical: { value: 6.2, unit: 'mmol/L', low: 3.9, high: 5.5 },
        }),
      ]),
    ]);
    expect(glucose.key).toBe('analyte:glucose');
    expect(glucose.name).toBe('Glukoza');
    expect(glucose.points.map((p) => [p.day, p.value])).toEqual([
      ['2021-03-01', 6.2],
      ['2026-09-01', 5.495],
    ]);
    expect(other.key).toBe('name:unknown|x');
  });

  it('leaves out the results that are not numbers', () => {
    expect(
      labSeries([panel('p', '2026-01-01', [line({ value: null, textValue: 'negative' })])]),
    ).toEqual([]);
  });
});

describe('lab input', () => {
  it('reads a result: a number with a comma or a point, or text', () => {
    expect(parseLabResult('5,6')).toEqual({ value: 5.6, textValue: null });
    expect(parseLabResult(' 1 250 ')).toEqual({ value: 1250, textValue: null });
    expect(parseLabResult('отрицательно')).toEqual({ value: null, textValue: 'отрицательно' });
    expect(parseLabResult('<0.5')).toEqual({ value: null, textValue: '<0.5' });
  });

  it('reads a range in the ways labs write it', () => {
    expect(parseLabRange('3,9 – 5,5')).toEqual({ refLow: 3.9, refHigh: 5.5, refText: null });
    expect(parseLabRange('3.9-5.5')).toEqual({ refLow: 3.9, refHigh: 5.5, refText: null });
    expect(parseLabRange('<5.2')).toEqual({ refLow: null, refHigh: 5.2, refText: null });
    expect(parseLabRange('до 5,2')).toEqual({ refLow: null, refHigh: 5.2, refText: null });
    expect(parseLabRange('> 1')).toEqual({ refLow: 1, refHigh: null, refText: null });
    expect(parseLabRange('negative')).toEqual({ refLow: null, refHigh: null, refText: 'negative' });
    expect(parseLabRange('')).toEqual({ refLow: null, refHigh: null, refText: null });
  });

  it('gives a range back as it can be typed again', () => {
    expect(formatLabRange(3.9, 5.5, null)).toBe('3.9–5.5');
    expect(formatLabRange(null, 5.2, null)).toBe('<5.2');
    expect(formatLabRange(null, null, 'negative')).toBe('negative');
    expect(parseLabRange(formatLabRange(3.9, 5.5, null))).toEqual({
      refLow: 3.9,
      refHigh: 5.5,
      refText: null,
    });
  });
});

describe('parseReminderTimes', () => {
  it('reads the times as typed, in order, once each', () => {
    expect(parseReminderTimes('20:00, 8:00; 08.00 25:00 noon')).toEqual(['08:00', '20:00']);
    expect(parseReminderTimes('')).toEqual([]);
  });
});
