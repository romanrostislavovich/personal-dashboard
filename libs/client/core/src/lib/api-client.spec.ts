import { ApiClient, ApiError } from './api-client';
import { Session } from './session';
import { memoryStorage } from './testing';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function setup(...responses: Response[]) {
  const fetch = vi.fn();
  responses.forEach((response) => fetch.mockResolvedValueOnce(response));
  const storage = memoryStorage({ 'pd.refreshToken': 'refresh-1' });
  const session = new Session(storage, 'storage');
  await session.start('access-1');
  const api = new ApiClient({ baseUrl: 'https://dash.test/', storage, fetch }, session);
  return { fetch, session, storage, api };
}

describe('ApiClient', () => {
  it('sends the token and JSON to the server address and reads JSON back', async () => {
    const { fetch, api } = await setup(json({ id: 'p1' }));

    expect(
      await api.post('/api/projects', { name: 'Blog' }, { query: { a: 1, b: undefined } }),
    ).toEqual({ id: 'p1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://dash.test/api/projects?a=1');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access-1',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe('{"name":"Blog"}');
  });

  it('an empty answer is undefined', async () => {
    const { api } = await setup(new Response(null, { status: 204 }));
    expect(await api.delete('/api/projects/p1')).toBeUndefined();
  });

  it('an expired access token is refreshed and the request sent again', async () => {
    const { fetch, session, storage, api } = await setup(
      json({ message: 'Unauthorized' }, 401),
      json({ accessToken: 'access-2', refreshToken: 'refresh-2', user: { id: 'u1' } }),
      json({ id: 'p1' }),
    );

    expect(await api.get('/api/projects')).toEqual({ id: 'p1' });
    const refresh = fetch.mock.calls[1] as [string, RequestInit];
    expect(refresh[0]).toBe('https://dash.test/api/auth/refresh');
    expect(refresh[1].body).toBe('{"refreshToken":"refresh-1"}');
    expect((fetch.mock.calls[2] as [string, RequestInit])[1].headers).toMatchObject({
      Authorization: 'Bearer access-2',
    });
    expect(session.token).toBe('access-2');
    expect(storage.values.get('pd.refreshToken')).toBe('refresh-2');
  });

  it('when the refresh is refused too, the session ends', async () => {
    const { session, api } = await setup(
      json({ message: 'Unauthorized' }, 401),
      json({ message: 'Signed out' }, 401),
    );

    const error = await api.get('/api/auth/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(session.token).toBeNull();
  });

  it('a 401 on sign-in is a wrong password, not an expired token', async () => {
    const { fetch, session, api } = await setup(
      json({ message: 'Invalid email or password' }, 401),
    );

    await expect(api.post('/api/auth/login', {})).rejects.toThrow(
      'API 401: Invalid email or password',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(session.token).toBe('access-1');
  });

  it('requests that expire together share one refresh', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        return json({ accessToken: 'access-2', user: {} });
      }
      const auth = (init?.headers as Record<string, string>)['Authorization'];
      return auth === 'Bearer access-2' ? json({ ok: true }) : json({}, 401);
    });
    const storage = memoryStorage({ 'pd.refreshToken': 'refresh-1' });
    const session = new Session(storage, 'storage');
    await session.start('access-1');
    const api = new ApiClient({ baseUrl: '', storage, fetch }, session);

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1);
  });
});
