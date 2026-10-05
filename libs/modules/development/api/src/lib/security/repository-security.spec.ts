import { RepositoryFacts, repositoryProblems } from './repository-security';

const clean: RepositoryFacts = {
  repository: 'me/dashboard',
  workflow: { conclusion: 'success', at: '2026-10-05T03:00:00Z', url: 'https://github.com/run/1' },
  dependencies: { open: 0, bySeverity: {}, worst: [] },
  secrets: { open: 0 },
  unread: [],
};

const graded = (facts: RepositoryFacts) =>
  Object.fromEntries(repositoryProblems(facts, 'en').map((p) => [p.key, p.severity]));

describe('repositoryProblems', () => {
  it('finds nothing in a repository that is in order', () => {
    expect(repositoryProblems(clean, 'en')).toEqual([]);
  });

  it('grades a failing check, alerts by their worst severity and secrets', () => {
    expect(
      graded({
        ...clean,
        workflow: { ...clean.workflow!, conclusion: 'failure' },
        dependencies: {
          open: 3,
          bySeverity: { high: 1, low: 2 },
          worst: [{ package: 'axios', severity: 'high', summary: 'SSRF' }],
        },
        secrets: { open: 1 },
      }),
    ).toEqual({ 'workflow-failing': 'high', dependencies: 'high', secrets: 'critical' });
  });

  it('says when the check never ran, and nothing about what it could not read', () => {
    expect(graded({ ...clean, workflow: null, dependencies: null, secrets: null })).toEqual({
      'workflow-missing': 'info',
    });
  });
});
