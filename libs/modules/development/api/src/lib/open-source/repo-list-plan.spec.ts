import { packageNameFrom } from './github-repos.client';
import { AccountRepo } from './repo-source';
import { planRepoList, SavedRepo } from './repo-list-plan';

function accountRepo(externalId: string, fullName: string): AccountRepo {
  return {
    externalId,
    fullName,
    relation: 'owner',
    htmlUrl: `https://github.com/${fullName}`,
    description: null,
    language: null,
    isFork: false,
    isArchived: false,
    isPrivate: false,
    stars: 0,
    forks: 0,
    openIssues: 0,
    openPulls: 0,
    pushedAt: null,
    latestRelease: null,
    packageName: null,
  };
}

function saved(id: string, fullName: string, extra: Partial<SavedRepo> = {}): SavedRepo {
  return { id, fullName, externalId: null, relation: 'owner', ...extra };
}

describe('planRepoList', () => {
  it('adds repositories of the account that are not saved yet', () => {
    const plan = planRepoList([], [accountRepo('R1', 'me/app')]);
    expect(plan.added.map((repo) => repo.fullName)).toEqual(['me/app']);
    expect(plan.matched).toEqual([]);
  });

  it('keeps a renamed repository as the same row', () => {
    const row = saved('1', 'me/old-name', { externalId: 'R1' });
    const plan = planRepoList([row], [accountRepo('R1', 'me/new-name')]);
    expect(plan.matched).toEqual([
      { row, repo: expect.objectContaining({ fullName: 'me/new-name' }) },
    ]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it('recognizes a repository added by hand earlier by its name', () => {
    const row = saved('1', 'Me/App', { relation: 'manual' });
    const plan = planRepoList([row], [accountRepo('R1', 'me/app')]);
    expect(plan.matched.map(({ row: matched }) => matched.id)).toEqual(['1']);
    expect(plan.manual).toEqual([]);
  });

  it('removes what the account no longer has and leaves hand-added ones alone', () => {
    const gone = saved('1', 'me/deleted', { externalId: 'R1' });
    const foreign = saved('2', 'angular/angular', { relation: 'manual' });
    const plan = planRepoList([gone, foreign], []);
    expect(plan.removed).toEqual([gone]);
    expect(plan.manual).toEqual([foreign]);
  });
});

describe('packageNameFrom', () => {
  it('takes the name of a published package', () => {
    expect(packageNameFrom('{"name":"@scope/lib","version":"1.0.0"}')).toBe('@scope/lib');
  });

  it('ignores private packages, files without a name and broken JSON', () => {
    expect(packageNameFrom('{"name":"my-app","private":true}')).toBeNull();
    expect(packageNameFrom('{"version":"1.0.0"}')).toBeNull();
    expect(packageNameFrom('{ not json')).toBeNull();
    expect(packageNameFrom(null)).toBeNull();
  });
});
