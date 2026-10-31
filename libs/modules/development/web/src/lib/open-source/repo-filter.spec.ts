import {TrackedRepo} from '@pd/contracts';
import {
  DEFAULT_REPO_FILTER,
  filterRepos,
  repoLanguages,
  repoProviders,
  sortRepos,
} from './repo-filter';

const repo = (values: Partial<TrackedRepo>): TrackedRepo =>
  ({
    id: crypto.randomUUID(),
    provider: 'github',
    relation: 'owner',
    fullName: 'me/app',
    htmlUrl: 'https://github.com/me/app',
    description: null,
    language: null,
    isFork: false,
    isArchived: false,
    isPrivate: false,
    hidden: false,
    notify: false,
    npmPackage: null,
    npmPackageManual: false,
    stars: 0,
    forks: 0,
    openIssues: 0,
    openPulls: 0,
    npmWeeklyDownloads: null,
    latestRelease: null,
    pushedAt: null,
    lastSyncedAt: null,
    syncError: null,
    starsDelta: {week: 0, month: 0},
    history: [],
    ...values,
  }) as TrackedRepo;

describe('the repository table', () => {
  const repos = [
    repo({fullName: 'me/dashboard', language: 'TypeScript', stars: 40}),
    repo({fullName: 'me/fork', isFork: true, language: 'Go'}),
    repo({fullName: 'me/old', isArchived: true}),
    repo({fullName: 'me/secret', isPrivate: true, description: 'Notes'}),
    repo({fullName: 'me/gl', provider: 'gitlab', stars: 5}),
  ];

  it('leaves out forks, archived and hidden ones until asked for', () => {
    const names = (filter = DEFAULT_REPO_FILTER) =>
      filterRepos(repos, filter).map(r => r.fullName);
    expect(names()).toEqual(['me/dashboard', 'me/secret', 'me/gl']);
    expect(names({...DEFAULT_REPO_FILTER, kinds: ['forks']})).toContain(
      'me/fork',
    );
    expect(names({...DEFAULT_REPO_FILTER, visibility: 'private'})).toEqual([
      'me/secret',
    ]);
    expect(names({...DEFAULT_REPO_FILTER, search: 'NOTES'})).toEqual([
      'me/secret',
    ]);
    expect(names({...DEFAULT_REPO_FILTER, provider: 'gitlab'})).toEqual([
      'me/gl',
    ]);
  });

  it('sorts with empty values last in either direction', () => {
    const order = (descending: boolean) =>
      sortRepos(repos, {column: 'language', descending}).map(r => r.language);
    expect(order(false).slice(0, 2)).toEqual(['Go', 'TypeScript']);
    expect(order(true).slice(0, 2)).toEqual(['TypeScript', 'Go']);
    expect(order(true).at(-1)).toBeNull();
    expect(
      sortRepos(repos, {column: 'stars', descending: true})[0].fullName,
    ).toBe('me/dashboard');
  });

  it('lists the languages and the providers present', () => {
    expect(repoLanguages(repos)).toEqual(['Go', 'TypeScript']);
    expect(repoProviders(repos)).toEqual(['github', 'gitlab']);
  });
});
