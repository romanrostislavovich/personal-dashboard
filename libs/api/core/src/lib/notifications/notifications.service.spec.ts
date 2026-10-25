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
    timeZoneOf: () => 'Europe/Warsaw',
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

  it('tells the desktop app which may be system notifications: not a section kept off it', async () => {
    const seen: Record<string, boolean | undefined> = {};
    const inApp = {
      name: 'in-app',
      durable: false,
      isEnabledFor: () => true,
      send: async (_u: unknown, n: { source: string; desktop?: boolean }) =>
        void (seen[n.source] = n.desktop),
    };
    const muted = {
      ...user,
      calm: { quietHours: null, softOverdue: false, muted: { music: ['desktop'] } },
    };
    const service = new NotificationsService(
      { ...users, findById: async () => muted } as never,
      fakeOutbox() as never,
      scheduler as never,
      [inApp] as never,
    );
    await service.send('u1', { title: 't', body: 'b', source: 'lastfm' });
    await service.send('u1', { title: 't', body: 'b', source: 'finance' });
    expect(seen).toEqual({ lastfm: false, finance: true });
  });

  it('keeps a muted section off just that channel; a service inside it too', async () => {
    const telegram = channel('telegram', true);
    const push = channel('push', true);
    const muted = {
      ...user,
      calm: { quietHours: null, softOverdue: false, muted: { music: ['push'] } },
    };
    const service = new NotificationsService(
      { ...users, findById: async () => muted } as never,
      fakeOutbox() as never,
      scheduler as never,
      [telegram, push] as never,
    );
    for (const source of ['music', 'lastfm', 'finance']) {
      await service.send('u1', { title: 't', body: 'b', source });
    }
    expect(telegram.sent).toEqual(['music', 'lastfm', 'finance']);
    expect(push.sent).toEqual(['finance']);
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

describe('quiet hours', () => {
  const quiet = {
    id: 'u1',
    email: 'me@example.com',
    locale: 'ru',
    layout: null,
    calm: { quietHours: { from: '21:00', to: '09:00' }, softOverdue: true },
  };
  const users = {
    findById: async () => quiet,
    hiddenSections: () => [],
    timeZoneOf: () => 'Europe/Warsaw',
  };
  const scheduler = { register: () => undefined };

  function setup() {
    const added: { status: string; heldUntil: Date | null }[] = [];
    const delivered: string[] = [];
    const held = [
      {
        id: 'h1',
        userId: 'u1',
        title: 'Сайт',
        body: 'не отвечает',
        channels: ['telegram'],
        attempts: 0,
      },
      {
        id: 'h2',
        userId: 'u1',
        title: 'Дневник',
        body: 'Как прошёл день?',
        channels: ['telegram'],
        attempts: 0,
      },
    ];
    const outbox = {
      add: async (
        _u: string,
        n: object,
        channels: string[],
        status: string,
        _e: unknown,
        heldUntil: Date | null,
      ) => {
        added.push({ status, heldUntil });
        return { id: 'r1', attempts: 0, channels, actions: [], ...n };
      },
      delivered: async (id: string) => void delivered.push(id),
      failed: async () => undefined,
      claimHeld: async () => held,
    };
    const sent: { title: string; body: string }[] = [];
    const toasts: string[] = [];
    const channels = [
      {
        name: 'telegram',
        durable: true,
        isEnabledFor: () => true,
        send: async (_u: unknown, n: { title: string; body: string }) => void sent.push(n),
      },
      {
        name: 'in-app',
        durable: false,
        isEnabledFor: () => true,
        send: async (_u: unknown, n: { title: string; desktop?: boolean }) =>
          void toasts.push(n.desktop ? `${n.title} (system)` : n.title),
      },
    ];
    const service = new NotificationsService(
      users as never,
      outbox as never,
      scheduler as never,
      channels as never,
    );
    return { service, added, delivered, sent, toasts };
  }

  afterEach(() => vi.useRealTimers());

  it('holds Telegram and the phone until the morning, and shows the toast now', async () => {
    // 23:30 in Warsaw (UTC+2 in October).
    vi.useFakeTimers({ now: new Date('2026-10-24T21:30:00Z'), toFake: ['Date'] });
    const { service, added, sent, toasts } = setup();
    await service.send('u1', { title: 'Сайт', body: 'не отвечает', source: 'monitoring' });
    expect(added).toEqual([{ status: 'held', heldUntil: new Date('2026-10-25T07:00:00Z') }]);
    expect(sent).toEqual([]);
    expect(toasts).toEqual(['Сайт']);
  });

  it('sends as usual outside them, and a test asked for now at any time', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-24T10:00:00Z'), toFake: ['Date'] });
    const { service, added } = setup();
    await service.send('u1', { title: 'a', body: 'b', source: 'core' });
    vi.setSystemTime(new Date('2026-10-24T22:00:00Z'));
    await service.send('u1', { title: 'test', body: 'b', source: 'core', now: true });
    expect(added.map((row) => row.status)).toEqual(['sending', 'sending']);
  });

  it('sends the night as one message in the morning', async () => {
    const { service, delivered, sent } = setup();
    await service.releaseHeld();
    expect(sent).toEqual([
      {
        title: '🌙 Пока было тихо: 2',
        body: '• Сайт: не отвечает\n• Дневник: Как прошёл день?',
        source: 'core',
      },
    ]);
    expect(delivered).toEqual(['h1', 'h2']);
  });
});
