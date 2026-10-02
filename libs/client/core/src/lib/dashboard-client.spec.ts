import { createDashboardClient } from './dashboard-client';
import { resolveLocale } from './locale';
import { memoryStorage } from './testing';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('createDashboardClient', () => {
  it('an app signs in: the refresh token is stored, the access token sent from then on', async () => {
    const storage = memoryStorage();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: 'a1', refreshToken: 'r1', user: { id: 'u1' } }))
      .mockResolvedValueOnce(json([]));
    const client = createDashboardClient({ baseUrl: '', storage, fetch });

    expect(await client.signIn({ email: 'a@b.c', password: 'secret123' })).toEqual({
      status: 'signed-in',
      user: { id: 'u1' },
    });
    await client.projects.list();

    expect(JSON.parse((fetch.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      email: 'a@b.c',
      password: 'secret123',
      client: 'app',
    });
    expect(storage.values.get('pd.refreshToken')).toBe('r1');
    expect((fetch.mock.calls[1] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer a1',
    });
  });

  it('with two-factor sign-in, a code finishes it', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ twoFactorRequired: true, challengeToken: 'c1' }))
      .mockResolvedValueOnce(json({ accessToken: 'a1', user: { id: 'u1' } }));
    const client = createDashboardClient({
      baseUrl: '',
      storage: memoryStorage(),
      fetch,
      refreshTokenIn: 'cookie',
    });

    expect(await client.signIn({ email: 'a@b.c', password: 'x' })).toEqual({
      status: 'code-required',
      challengeToken: 'c1',
    });
    expect(await client.completeSignIn('c1', '123456')).toEqual({ id: 'u1' });
    const [url, init] = fetch.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/auth/login/2fa');
    expect(JSON.parse(init.body as string)).toEqual({ challengeToken: 'c1', code: '123456' });
    expect(client.session.token).toBe('a1');
  });

  it('restores a session with the refresh token; a refused one signs out', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ accessToken: 'a2', user: { id: 'u1' } }));
    const client = createDashboardClient({
      baseUrl: '',
      storage: memoryStorage(),
      fetch,
      refreshTokenIn: 'cookie',
    });
    expect(await client.restoreSession()).toEqual({ id: 'u1' });
    expect(client.session.token).toBe('a2');

    fetch.mockResolvedValueOnce(json({ message: 'Signed out' }, 401));
    const other = createDashboardClient({
      baseUrl: '',
      storage: memoryStorage(),
      fetch,
      refreshTokenIn: 'cookie',
    });
    expect(await other.restoreSession()).toBeNull();
    expect(other.session.isSignedIn).toBe(false);
  });
});

describe('resolveLocale', () => {
  it('saved choice, then device languages, then English', () => {
    expect(resolveLocale('ru', ['en-US'])).toBe('ru');
    expect(resolveLocale(null, ['de-DE', 'ru-RU'])).toBe('ru');
    expect(resolveLocale('fr', ['de'])).toBe('en');
  });

  it('keeps a change made offline and sends it when the server answers again', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: 'a1', user: { id: 'u1' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ id: 't1' }, 201));
    const client = createDashboardClient({
      baseUrl: '',
      storage: memoryStorage(),
      fetch,
      refreshTokenIn: 'cookie',
    });
    await client.signIn({ email: 'a@b.c', password: 'x' });

    // No connection: the call does not fail, the task waits.
    expect(await client.api.post('/api/tasks', { title: 'milk' })).toBeUndefined();
    expect(await client.outbox.pending()).toBe(1);

    expect(await client.api.flushOutbox()).toMatchObject({ sent: 1, left: 0 });
    const [url, init] = fetch.mock.calls[2] as [string, RequestInit];
    expect(url).toBe('/api/tasks');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'milk' });
  });

  it('does not queue what needs an answer: reads and outside services fail offline', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = createDashboardClient({ baseUrl: '', storage: memoryStorage(), fetch });
    await expect(client.api.get('/api/tasks')).rejects.toThrow('Failed to fetch');
    await expect(client.api.post('/api/ai/chat', {})).rejects.toThrow('Failed to fetch');
    expect(await client.outbox.pending()).toBe(0);
  });

  it('remembers the user for a start without a connection, until signed out', async () => {
    const storage = memoryStorage();
    const online = vi
      .fn()
      .mockResolvedValueOnce(json({ accessToken: 'a1', user: { id: 'u1', displayName: 'R' } }));
    const first = createDashboardClient({
      baseUrl: '',
      storage,
      fetch: online,
      refreshTokenIn: 'cookie',
    });
    await first.restoreSession();

    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const later = createDashboardClient({
      baseUrl: '',
      storage,
      fetch: offline,
      refreshTokenIn: 'cookie',
    });
    expect(await later.restoreSession()).toBeNull();
    expect(await later.offlineUser()).toEqual({ id: 'u1', displayName: 'R' });

    await later.signOut();
    expect(await later.offlineUser()).toBeNull();
  });
});
