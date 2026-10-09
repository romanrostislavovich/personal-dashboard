import { allowedInDemo } from './demo.guard';

describe('allowedInDemo', () => {
  it('lets everything be read', () => {
    expect(allowedInDemo('GET', '/api/security')).toBe(true);
    expect(allowedInDemo('GET', '/api/data/export')).toBe(true);
  });

  it('lets the demo user change their own everyday data', () => {
    expect(allowedInDemo('POST', '/api/tasks')).toBe(true);
    expect(allowedInDemo('POST', '/api/tasks/123/complete')).toBe(true);
    expect(allowedInDemo('PUT', '/api/diary/entries/2026-10-09')).toBe(true);
    expect(allowedInDemo('POST', '/api/finance/transactions?x=1')).toBe(true);
    expect(allowedInDemo('DELETE', '/api/birthdays/1')).toBe(true);
    expect(allowedInDemo('PATCH', '/api/auth/me')).toBe(true);
    expect(allowedInDemo('POST', '/api/automations')).toBe(true);
  });

  it('refuses the account, outside services, files and the instance itself', () => {
    for (const [method, path] of [
      ['PUT', '/api/auth/password'],
      ['POST', '/api/auth/2fa/enable'],
      ['POST', '/api/auth/sessions/revoke-others'],
      ['POST', '/api/automations/draft'],
      ['POST', '/api/activity/devices'],
      ['DELETE', '/api/diary'],
      ['POST', '/api/life/story'],
      ['POST', '/api/ai/connections'],
      ['POST', '/api/ai/chat'],
      ['POST', '/api/monitoring/monitors'],
      ['POST', '/api/finance/wishlist'],
      ['PUT', '/api/development/github/token'],
      ['POST', '/api/sync/resync'],
      ['POST', '/api/data/import'],
      ['POST', '/api/security/scan'],
      ['POST', '/api/diary/entries/2026-10-09/photos'],
      ['POST', '/api/finance/transactions/1/receipts'],
      // A path that only starts like an allowed one.
      ['POST', '/api/tasksx'],
    ]) {
      expect([method, path, allowedInDemo(method, path)]).toEqual([method, path, false]);
    }
  });
});
