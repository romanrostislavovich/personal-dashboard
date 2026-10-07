import { belongsTo, namesOf } from './project-names';

describe('belongsTo', () => {
  const names = namesOf({ name: 'Personal Dashboard', aliases: ['roma/personal-dashboard', 'pd'] });

  it('knows a repository by its full name or by the part after the owner', () => {
    expect(belongsTo('Roma/Personal-Dashboard', names)).toBe(true);
    expect(belongsTo('someone/pd', names)).toBe(true);
    expect(belongsTo('personal dashboard', names)).toBe(true);
  });

  it('does not take a name that only contains the alias', () => {
    expect(belongsTo('roma/pd-tools', names)).toBe(false);
    expect(belongsTo('other', names)).toBe(false);
  });
});
