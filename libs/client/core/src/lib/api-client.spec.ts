import { ApiClient, ApiError } from './api-client';
import { Session } from './session';
import { memoryStorage } from './testing';

function setup(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  const session = new Session(memoryStorage({ 'pd.accessToken': 'token-1' }));
  const api = new ApiClient(
    { baseUrl: 'https://dash.test/', storage: memoryStorage(), fetch },
    session,
  );
  return { fetch, session, api };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ApiClient', () => {
  it('sends the token and JSON to the server address and reads JSON back', async () => {
    const { fetch, session, api } = setup(json({ id: 'p1' }));
    await session.restore();

    expect(
      await api.post('/api/projects', { name: 'Blog' }, { query: { a: 1, b: undefined } }),
    ).toEqual({ id: 'p1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://dash.test/api/projects?a=1');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe('{"name":"Blog"}');
  });

  it('an empty answer is undefined', async () => {
    const { api } = setup(new Response(null, { status: 204 }));
    expect(await api.delete('/api/projects/p1')).toBeUndefined();
  });

  it('a 401 ends the session; the server message is in the error', async () => {
    const { session, api } = setup(json({ message: 'Unauthorized' }, 401));
    await session.restore();

    const error = await api.get('/api/auth/me').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe('API 401: Unauthorized');
    expect(session.token).toBeNull();
  });

  it('a 401 on sign-in is a wrong password, not an ended session', async () => {
    const { session, api } = setup(json({ message: 'Wrong email or password' }, 401));
    await session.restore();

    await expect(api.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiError);
    expect(session.token).toBe('token-1');
  });
});
