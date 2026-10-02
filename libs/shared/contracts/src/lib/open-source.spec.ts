import { npmPackageName, parseRepoReference, trackedRepoInputSchema } from './open-source';

describe('npmPackageName', () => {
  it('takes the name from a package page on npmjs.com', () => {
    expect(npmPackageName('https://www.npmjs.com/package/translate-lint')).toBe('translate-lint');
    expect(npmPackageName('npmjs.com/package/translate-lint?activeTab=readme')).toBe(
      'translate-lint',
    );
    expect(npmPackageName('https://www.npmjs.com/package/@scope/name/v/1.2.0')).toBe('@scope/name');
  });

  it('leaves a name as it is', () => {
    expect(npmPackageName(' ngx-translate-lint ')).toBe('ngx-translate-lint');
    expect(npmPackageName('@scope/name')).toBe('@scope/name');
  });
});

describe('trackedRepoInputSchema', () => {
  it('saves the package name when a link is pasted', () => {
    const input = trackedRepoInputSchema.parse({
      repo: 'romanrostislavovich/translate-lint',
      npmPackage: 'https://www.npmjs.com/package/translate-lint',
    });
    expect(input.npmPackage).toBe('translate-lint');
  });

  it('refuses what is not a package name', () => {
    const input = { repo: 'a/b', npmPackage: 'https://example.com/translate-lint' };
    expect(trackedRepoInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('parseRepoReference', () => {
  it('takes a bare owner/name as a GitHub repository unless told otherwise', () => {
    expect(parseRepoReference('owner/name')).toEqual({ provider: 'github', repo: 'owner/name' });
    expect(parseRepoReference('owner/name', 'bitbucket')).toEqual({
      provider: 'bitbucket',
      repo: 'owner/name',
    });
  });

  it('reads the service from a link', () => {
    expect(parseRepoReference('https://github.com/owner/name/')).toEqual({
      provider: 'github',
      repo: 'owner/name',
    });
    expect(parseRepoReference('https://gitlab.com/group/sub/name/-/issues?state=opened')).toEqual({
      provider: 'gitlab',
      repo: 'group/sub/name',
    });
    expect(parseRepoReference('bitbucket.org/team/repo/src/main/')).toEqual({
      provider: 'bitbucket',
      repo: 'team/repo',
    });
    expect(parseRepoReference('git@x', 'gitlab')).toBeNull();
  });

  it('refuses another host and a path that is not a repository', () => {
    expect(parseRepoReference('https://example.com/owner/name')).toBeNull();
    expect(parseRepoReference('https://github.com/owner')).toBeNull();
    // Nested groups exist only on GitLab.
    expect(parseRepoReference('a/b/c')).toBeNull();
    expect(parseRepoReference('a/b/c', 'gitlab')).toEqual({ provider: 'gitlab', repo: 'a/b/c' });
  });
});

describe('trackedRepoInputSchema: the service', () => {
  it('adds the service of the link to the input', () => {
    const input = trackedRepoInputSchema.parse({ repo: 'https://gitlab.com/group/name' });
    expect(input).toMatchObject({ provider: 'gitlab', repo: 'group/name' });
  });

  it('stays the same when parsed again', () => {
    const once = trackedRepoInputSchema.parse({ repo: 'https://bitbucket.org/team/repo' });
    expect(trackedRepoInputSchema.parse(once)).toEqual(once);
  });
});
