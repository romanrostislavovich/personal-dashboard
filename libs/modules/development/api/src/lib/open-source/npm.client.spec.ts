import { githubRepoOf } from './npm.client';

describe('githubRepoOf', () => {
  it('reads every form of the repository field npm accepts', () => {
    const forms: unknown[] = [
      'git+https://github.com/Owner/My.Lib.git',
      'https://github.com/owner/my.lib',
      'git@github.com:owner/my.lib.git',
      'git://github.com/owner/my.lib.git',
      'github:owner/my.lib',
      'owner/my.lib',
      { type: 'git', url: 'git+https://github.com/owner/my.lib.git' },
      // A package of a monorepo points into a folder of the repository.
      { type: 'git', url: 'https://github.com/owner/my.lib/tree/main/packages/core' },
    ];
    for (const form of forms) {
      expect(githubRepoOf(form)).toBe('owner/my.lib');
    }
  });

  it('gives nothing for another host or a missing field', () => {
    expect(githubRepoOf('https://gitlab.com/owner/lib.git')).toBeNull();
    expect(githubRepoOf('gitlab:owner/lib')).toBeNull();
    expect(githubRepoOf({ type: 'git' })).toBeNull();
    expect(githubRepoOf(undefined)).toBeNull();
    expect(githubRepoOf(null)).toBeNull();
  });
});
