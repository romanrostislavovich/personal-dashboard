import { ProjectFact } from '@pd/contracts';
import { paysOff, sectionsOf } from './links.achievements';

const fact = (module: string, value = 1, metric?: ProjectFact['metric']): ProjectFact => ({
  module,
  labelKey: module,
  value,
  unit: 'count',
  metric,
});

describe('achievements of the links', () => {
  it('counts the sections that know a project, each once', () => {
    const facts = [fact('activity'), fact('activity'), fact('finance'), fact('tasks')];
    expect(sectionsOf({ facts })).toBe(3);
    expect(sectionsOf({ facts: [] })).toBe(0);
  });

  it('calls a project paying when it brought more than it cost over ten hours', () => {
    const worked = [fact('activity', 12 * 3600, 'seconds')];
    const rate = { income: 40, expense: 5, currency: 'EUR' };
    expect(paysOff({ facts: worked, perHour: rate })).toBe(true);
    expect(paysOff({ facts: worked, perHour: { ...rate, income: 3 } })).toBe(false);
    expect(paysOff({ facts: worked, perHour: null })).toBe(false);
    expect(paysOff({ facts: [fact('activity', 3600, 'seconds')], perHour: rate })).toBe(false);
  });
});
