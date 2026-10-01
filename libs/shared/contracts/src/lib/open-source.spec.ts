import { npmPackageName, trackedRepoInputSchema } from './open-source';

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
