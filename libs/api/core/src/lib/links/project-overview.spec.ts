import { ProjectFact } from '@pd/contracts';
import { perHour } from './project-overview.service';

const fact = (metric: ProjectFact['metric'], value: number, currency?: string): ProjectFact => ({
  module: 'x',
  labelKey: 'x',
  value,
  unit: currency ? 'money' : 'seconds',
  currency,
  metric,
});

describe('perHour', () => {
  it('divides the money by the larger of the tracked and the coded hours', () => {
    const facts = [
      fact('seconds', 5 * 3600),
      fact('codingSeconds', 10 * 3600),
      fact('income', 1000, 'EUR'),
      fact('expense', 55, 'EUR'),
    ];
    expect(perHour(facts)).toEqual({ income: 100, expense: 5.5, currency: 'EUR' });
  });

  it('says nothing without an hour of work or without money', () => {
    expect(perHour([fact('seconds', 600), fact('income', 10, 'EUR')])).toBeNull();
    expect(perHour([fact('seconds', 7200)])).toBeNull();
  });
});
