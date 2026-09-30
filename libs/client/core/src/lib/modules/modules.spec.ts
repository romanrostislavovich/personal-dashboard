import { ApiClient, apiRequest } from '../api-client';
import { Session } from '../session';
import { memoryStorage } from '../testing';
import { diaryApi, DIARY_READS } from './diary';
import { FINANCE_READS } from './finance';
import { GAMES_READS } from './games';

function client(response = new Response(JSON.stringify({ id: 'p1' }))) {
  const fetch = vi.fn().mockResolvedValue(response);
  const api = new ApiClient(
    { baseUrl: '', storage: memoryStorage(), fetch },
    new Session(memoryStorage()),
  );
  return { fetch, api };
}

describe('read requests', () => {
  it('leave unset parameters out, as the server expects', () => {
    expect(apiRequest('/x', { a: 1, b: null, c: undefined, d: true })).toEqual({
      url: '/x',
      params: { a: 1, d: 'true' },
    });
    expect(FINANCE_READS.transactions({ from: '2026-09-01', to: '2026-09-30', scope: '' })).toEqual(
      {
        url: '/api/finance/transactions',
        params: { from: '2026-09-01', to: '2026-09-30' },
      },
    );
    expect(GAMES_READS.dotaOverview(null)).toEqual({ url: '/api/games/dota/overview' });
    expect(DIARY_READS.entries({ from: '2026-09-01', to: '2026-09-30' })).toEqual({
      url: '/api/diary/entries',
      params: { from: '2026-09-01', to: '2026-09-30' },
    });
  });

  it('are what ApiClient.read sends', async () => {
    const { fetch, api } = client();
    await diaryApi(api).search('кофе');
    expect(fetch.mock.calls[0][0]).toBe('/api/diary/search?q=%D0%BA%D0%BE%D1%84%D0%B5');
  });
});

describe('files', () => {
  it('a photo goes as a form, without a JSON content type', async () => {
    const { fetch, api } = client();
    await diaryApi(api).uploadPhoto('2026-09-30', new Blob(['png'], { type: 'image/png' }));

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/diary/entries/2026-09-30/photos');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).not.toHaveProperty('Content-Type');
  });

  it('a photo comes back as a blob', async () => {
    const { api } = client(new Response(new Blob(['png'], { type: 'image/png' })));
    const photo = await diaryApi(api).photo('abc');
    expect(photo.type).toBe('image/png');
    expect(await photo.text()).toBe('png');
  });
});
