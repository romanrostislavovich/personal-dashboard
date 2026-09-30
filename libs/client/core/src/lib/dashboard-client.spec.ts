import { createDashboardClient } from './dashboard-client';
import { resolveLocale } from './locale';
import { memoryStorage } from './testing';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('createDashboardClient', () => {
  it('signs in: the token is saved and sent from then on', async () => {
    const storage = memoryStorage();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: 't1', user: { id: 'u1' } }))
      .mockResolvedValueOnce(json([]));
    const client = createDashboardClient({ baseUrl: '', storage, fetch });

    expect(await client.signIn({ email: 'a@b.c', password: 'secret123' })).toEqual({ id: 'u1' });
    await client.projects.list();

    expect(storage.values.get('pd.accessToken')).toBe('t1');
    expect((fetch.mock.calls[1] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer t1',
    });
  });

  it('restoring with a token the server no longer accepts signs out', async () => {
    const storage = memoryStorage({ 'pd.accessToken': 'old' });
    const fetch = vi.fn().mockResolvedValue(json({ message: 'Unauthorized' }, 401));
    const client = createDashboardClient({ baseUrl: '', storage, fetch });

    expect(await client.restoreSession()).toBeNull();
    expect(client.session.isSignedIn).toBe(false);
    expect(storage.values.has('pd.accessToken')).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('saved choice, then device languages, then English', () => {
    expect(resolveLocale('ru', ['en-US'])).toBe('ru');
    expect(resolveLocale(null, ['de-DE', 'ru-RU'])).toBe('ru');
    expect(resolveLocale('fr', ['de'])).toBe('en');
  });
});
