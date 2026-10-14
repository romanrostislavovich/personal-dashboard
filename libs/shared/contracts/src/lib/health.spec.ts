import { HealthDiagnosis, healthConditions, healthDiagnosisInputSchema } from './health';

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
