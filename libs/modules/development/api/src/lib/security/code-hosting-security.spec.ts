import { HostingFacts, hostingProblems, RepositoryFacts } from './code-hosting-security';

const now = new Date('2026-10-05T12:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

const repository = (name: string, changes: Partial<RepositoryFacts> = {}): RepositoryFacts => ({
  name,
  dependencies: {},
  secrets: 0,
  securityCheck: null,
  ...changes,
});

const github: HostingFacts = {
  hosting: 'github',
  account: { login: 'me', twoFactor: true },
  token: { expiresAt: inDays(200), scopes: ['repo', 'read:user', 'security_events'] },
  repositories: [repository('me/dashboard')],
};

const graded = (hostings: HostingFacts[]) =>
  Object.fromEntries(hostingProblems(hostings, 'en', now).map((p) => [p.key, p.severity]));

describe('hostingProblems', () => {
  it('finds nothing in accounts that are in order', () => {
    const gitlab: HostingFacts = {
      hosting: 'gitlab',
      account: { login: 'me', twoFactor: true },
      token: { expiresAt: null, scopes: ['read_api', 'read_user'] },
      repositories: [],
    };
    // Bitbucket tells neither: nothing is claimed about what is not known.
    const bitbucket: HostingFacts = {
      hosting: 'bitbucket',
      account: { login: 'me', twoFactor: null },
      token: { expiresAt: null, scopes: null },
      repositories: [],
    };
    expect(hostingProblems([github, gitlab, bitbucket], 'en', now)).toEqual([]);
  });

  it('grades the account and the token of each hosting under its own key', () => {
    expect(
      graded([
        {
          ...github,
          account: { login: 'me', twoFactor: false },
          token: { expiresAt: inDays(5), scopes: ['repo', 'delete_repo', 'admin:org'] },
          repositories: [],
        },
        {
          hosting: 'gitlab',
          account: { login: 'me', twoFactor: true },
          token: { expiresAt: inDays(-2), scopes: ['api'] },
          repositories: [],
        },
      ]),
    ).toEqual({
      'github.two-factor-off': 'medium',
      'github.token-expiring': 'low',
      'github.token-broad': 'low',
      'gitlab.token-expired': 'medium',
      'gitlab.token-broad': 'low',
    });
  });

  it('grades a repository by its worst alert, its secrets and its failing check', () => {
    expect(
      graded([
        {
          ...github,
          repositories: [
            repository('me/clean'),
            repository('me/app', {
              dependencies: { high: 1, low: 4 },
              secrets: 2,
              securityCheck: { conclusion: 'failure', url: 'https://github.com/run/1' },
            }),
          ],
        },
      ]),
    ).toEqual({
      'github.me/app.dependencies': 'high',
      'github.me/app.secrets': 'critical',
      'github.me/app.check-failing': 'high',
    });
  });

  it('says once that no alerts are readable, not once a repository', () => {
    const unreadable = { dependencies: null, secrets: null };
    expect(
      graded([
        {
          ...github,
          repositories: [repository('me/a', unreadable), repository('me/b', unreadable)],
        },
      ]),
    ).toEqual({ 'github.alerts-unreadable': 'info' });
  });
});
