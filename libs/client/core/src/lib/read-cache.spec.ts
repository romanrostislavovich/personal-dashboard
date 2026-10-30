import {ApiClient, ApiError} from './api-client';
import {isCacheable, memoryReadCache} from './read-cache';
import {Session} from './session';
import {memoryStorage} from './testing';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {status});

async function setup() {
  const fetch = vi.fn();
  const storage = memoryStorage({'pd.refreshToken': 'refresh-1'});
  const session = new Session(storage, 'storage');
  await session.start('access-1');
  const readCache = memoryReadCache();
  const api = new ApiClient(
    {baseUrl: 'https://dash.test', storage, fetch, readCache},
    session,
  );
  return {fetch, api, readCache};
}

describe('reading without a connection', () => {
  it('gives the last answer when the server cannot be reached', async () => {
    const {fetch, api} = await setup();
    fetch.mockResolvedValueOnce(json([{day: '2026-10-24'}]));
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const query = {query: {from: '2026-10-01', to: '2026-10-31'}};
    expect(await api.get('/api/diary/entries', query)).toEqual([
      {day: '2026-10-24'},
    ]);
    // Allow the cache write (it is not awaited by the request) to land.
    await Promise.resolve();
    expect(await api.get('/api/diary/entries', query)).toEqual([
      {day: '2026-10-24'},
    ]);
  });

  it('keeps each address apart, and a read never made still fails', async () => {
    const {fetch, api} = await setup();
    fetch.mockResolvedValueOnce(json({month: 10}));
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await api.get('/api/diary/entries', {query: {from: '2026-10-01'}});
    await Promise.resolve();
    await expect(
      api.get('/api/diary/entries', {query: {from: '2026-09-01'}}),
    ).rejects.toThrow(TypeError);
  });

  it("shows the server's error, not an old answer", async () => {
    const {fetch, api} = await setup();
    fetch.mockResolvedValueOnce(json({id: 't1'}));
    fetch.mockResolvedValueOnce(json({message: 'Not found'}, 404));

    await api.get('/api/tasks/t1');
    await Promise.resolve();
    await expect(api.get('/api/tasks/t1')).rejects.toBeInstanceOf(ApiError);
  });

  it('keeps no writes, no live stream and no sign-in', async () => {
    const {fetch, api, readCache} = await setup();
    fetch.mockResolvedValueOnce(json({id: 't1'}));
    await api.post('/api/tasks', {title: 'x'});
    await Promise.resolve();
    expect(await readCache.get('https://dash.test/api/tasks')).toBeNull();
    expect(isCacheable('/api/events')).toBe(false);
    expect(isCacheable('/api/auth/me')).toBe(false);
    expect(isCacheable('/api/diary/entries')).toBe(true);
  });
});
