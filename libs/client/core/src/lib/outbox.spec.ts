import { isQueueable, Outbox, QueuedWrite } from './outbox';
import { KeyValueStore } from './platform';

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => void values.set(key, value),
    remove: async (key) => void values.delete(key),
  };
}

const refused = Object.assign(new Error('refused'), { status: 400 });

describe('isQueueable', () => {
  it("lets the user's own records wait for a connection", () => {
    expect(isQueueable('POST', '/api/tasks', {})).toBe(true);
    expect(isQueueable('PATCH', '/api/tasks/reminders/abc', {})).toBe(true);
    expect(isQueueable('PUT', '/api/diary/entries/2026-10-02', {})).toBe(true);
    expect(isQueueable('DELETE', '/api/finance/transactions/abc', undefined)).toBe(true);
  });

  it('leaves out reads, sign-in and whatever needs an outside service', () => {
    expect(isQueueable('GET', '/api/tasks', undefined)).toBe(false);
    expect(isQueueable('POST', '/api/auth/login', {})).toBe(false);
    expect(isQueueable('POST', '/api/finance/cost-sources/abc/sync', {})).toBe(false);
    expect(isQueueable('POST', '/api/diary/summary', {})).toBe(false);
    expect(isQueueable('POST', '/api/ai/chat', {})).toBe(false);
  });
});

describe('Outbox', () => {
  it('sends the changes in the order they were made and keeps them across restarts', async () => {
    const storage = memoryStore();
    const outbox = new Outbox(storage);
    await outbox.add('POST', '/api/tasks', { title: 'one' });
    await outbox.add('POST', '/api/tasks', { title: 'two' });

    // A new instance: the app was closed and opened again.
    const sent: unknown[] = [];
    const result = await new Outbox(storage).flush(async (write) => void sent.push(write.body));
    expect(sent).toEqual([{ title: 'one' }, { title: 'two' }]);
    expect(result).toMatchObject({ sent: 2, left: 0, refused: [] });
  });

  it('keeps only the last of several saves of the same record', async () => {
    const outbox = new Outbox(memoryStore());
    await outbox.add('PUT', '/api/diary/entries/2026-10-02', { content: 'a' });
    await outbox.add('POST', '/api/tasks', { title: 'between' });
    await outbox.add('PUT', '/api/diary/entries/2026-10-02', { content: 'ab' });
    const sent: QueuedWrite[] = [];
    await outbox.flush(async (write) => void sent.push(write));
    expect(sent.map((write) => write.body)).toEqual([{ title: 'between' }, { content: 'ab' }]);
  });

  it('stops when there is still no connection and goes on next time', async () => {
    const outbox = new Outbox(memoryStore());
    await outbox.add('POST', '/api/tasks', { title: 'one' });
    await outbox.add('POST', '/api/tasks', { title: 'two' });

    const offline = await outbox.flush(async () => {
      throw new TypeError('fetch failed');
    });
    expect(offline).toMatchObject({ sent: 0, left: 2 });
    expect((await outbox.flush(async () => undefined)).sent).toBe(2);
  });

  it('drops a change the server refuses and sends the rest', async () => {
    const outbox = new Outbox(memoryStore());
    const counts: number[] = [];
    outbox.onChange((pending) => counts.push(pending));
    await outbox.add('POST', '/api/tasks', { title: '' });
    await outbox.add('POST', '/api/tasks', { title: 'good' });

    const result = await outbox.flush(async (write) => {
      if ((write.body as { title: string }).title === '') {
        throw refused;
      }
    });
    expect(result.sent).toBe(1);
    expect(result.refused.map((write) => write.body)).toEqual([{ title: '' }]);
    expect(await outbox.pending()).toBe(0);
    expect(counts).toEqual([1, 2, 1, 0]);
  });
});
