import { githubTokenExpiry, gitlabTokenExpiry } from './token-expiry';

describe('token expiry', () => {
  it('reads the header GitHub sends for a token that expires', () => {
    expect(githubTokenExpiry('2026-11-01 08:30:00 UTC')?.toISOString()).toBe(
      '2026-11-01T08:30:00.000Z',
    );
  });

  it('takes a token without the header, or with another format, as one that does not expire', () => {
    expect(githubTokenExpiry(null)).toBeNull();
    expect(githubTokenExpiry('soon')).toBeNull();
  });

  it('reads the day GitLab gives: the token stops when that day begins', () => {
    expect(gitlabTokenExpiry('2026-12-31')?.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(gitlabTokenExpiry(null)).toBeNull();
    expect(gitlabTokenExpiry('never')).toBeNull();
  });
});
