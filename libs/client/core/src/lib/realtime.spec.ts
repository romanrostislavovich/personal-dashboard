import { ApiClient } from './api-client';
import { RealtimeConnection, SseParser } from './realtime';
import { Session } from './session';
import { memoryStorage } from './testing';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('SseParser', () => {
  it('reads events split across chunks, even inside a character', () => {
    const parser = new SseParser();
    const all = bytes('data: {"type":"ping"}\n\ndata: {"type":"achievements","titles":["Ёж"]}\n\n');
    const cut = all.indexOf(0xd0, 30) + 1; // In the middle of the two bytes of "Ё".

    expect(parser.push(all.slice(0, cut))).toEqual([{ type: 'ping' }]);
    expect(parser.push(all.slice(cut))).toEqual([{ type: 'achievements', titles: ['Ёж'] }]);
  });
});

describe('RealtimeConnection', () => {
  it('connects when signed in, with the token, and passes events on (not pings)', async () => {
    const session = new Session(memoryStorage(), 'storage');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes('data: {"type":"ping"}\n\ndata: {"type":"notification"}\n\n'));
      },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(stream));
    const api = new ApiClient({ baseUrl: '', storage: memoryStorage(), fetch }, session);
    const connection = new RealtimeConnection(api, session, fetch);
    const events: unknown[] = [];
    connection.subscribe((event) => events.push(event));

    connection.start();
    expect(fetch).not.toHaveBeenCalled(); // Signed out: nothing to connect to.
    await session.start('token-1');
    await vi.waitFor(() => expect(events).toEqual([{ type: 'notification' }]));

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/events');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-1' });

    await session.end();
    expect((init.signal as AbortSignal).aborted).toBe(true);
    connection.stop();
  });
});
