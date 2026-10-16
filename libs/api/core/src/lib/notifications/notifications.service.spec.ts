import { DeliveryError } from './notification-channel';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const user = {
    id: 'u1',
    email: 'me@example.com',
    layout: { layout: { hiddenSections: ['games'], widgets: [] }, everywhereAt: '' },
  };
  const users = {
    findById: async () => user,
    hiddenSections: (u: typeof user) => u.layout.layout.hiddenSections,
  };
  const scheduler = { register: () => undefined };

  /** The outbox as calls: what was written down and what became of it. */
  function fakeOutbox() {
    const calls: string[] = [];
    let id = 0;
    return {
      calls,
      add: async (_userId: string, n: object, channels: string[], status: string) => {
        calls.push(`add ${status}`);
        return { id: String(++id), attempts: 0, channels, actions: [], ...n };
      },
      delivered: async (rowId: string) => void calls.push(`delivered ${rowId}`),
      failed: async (_row: unknown, remaining: string[], _e: string, options: object) =>
        void calls.push(`failed [${remaining}] ${JSON.stringify(options)}`),
    };
  }

  function channel(
    name: string,
    durable: boolean,
    send: () => Promise<void> = async () => undefined,
  ) {
    const sent: string[] = [];
    return {
      sent,
      name,
      durable,
      isEnabledFor: () => true,
      send: async (_user: unknown, notification: { source: string }) => {
        await send();
        sent.push(notification.source);
      },
    };
  }

  it('keeps a hidden section quiet, a service inside it too, and sends the rest', async () => {
    const telegram = channel('telegram', true);
    const outbox = fakeOutbox();
    const service = new NotificationsService(
      users as never,
      outbox as never,
      scheduler as never,
      [telegram] as never,
    );
    for (const source of ['games', 'steam', 'finance', 'core']) {
      await service.send('u1', { title: 't', body: 'b', source });
    }
    expect(telegram.sent).toEqual(['finance', 'core']);
    expect(outbox.calls).toEqual(['add sending', 'delivered 1', 'add sending', 'delivered 2']);
  });

  it('marks a failed channel to be tried again, and gives up when it cannot help', async () => {
    const outbox = fakeOutbox();
    const busy = channel('telegram', true, async () => {
      throw new DeliveryError('429', { retryAfterMs: 30_000 });
    });
    const toast = channel('in-app', false);
    await new NotificationsService(
      users as never,
      outbox as never,
      scheduler as never,
      [busy, toast] as never,
    ).send('u1', { title: 't', body: 'b', source: 'finance' });
    expect(toast.sent).toEqual(['finance']);
    expect(outbox.calls).toEqual([
      'add sending',
      'failed [telegram] {"retryAfterMs":30000,"permanent":false}',
    ]);

    const blocked = fakeOutbox();
    const gone = channel('telegram', true, async () => {
      throw new DeliveryError('403', { permanent: true });
    });
    await new NotificationsService(
      users as never,
      blocked as never,
      scheduler as never,
      [gone] as never,
    ).send('u1', { title: 't', body: 'b', source: 'finance' });
    expect(blocked.calls[1]).toBe('failed [] {"retryAfterMs":0,"permanent":true}');
  });

  it('sends nothing when the outbox says the same went out a moment ago', async () => {
    const telegram = channel('telegram', true);
    const outbox = { ...fakeOutbox(), add: async () => null };
    await new NotificationsService(
      users as never,
      outbox as never,
      scheduler as never,
      [telegram] as never,
    ).send('u1', { title: 't', body: 'b', source: 'finance' });
    expect(telegram.sent).toEqual([]);
  });
});
