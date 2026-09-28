import { Logger } from '@nestjs/common';
import { AchievementsService } from './achievements.service';

/** A service with a fake database that has no unlocked achievements yet. */
function setup(syncMode: 'off' | 'server' | 'client') {
  const insertValues = vi.fn((_rows: unknown) => ({
    onConflictDoNothing: () => ({ returning: async () => [{ id: 'test.plays.10' }] }),
  }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const db = { select: () => ({ from: () => ({ where: async () => [] }) }), insert };
  const config = { get: (key: string) => (key === 'SYNC_MODE' ? syncMode : undefined) };
  const users = { findById: async () => ({ locale: 'en' }), findAll: async () => [] };
  const notifications = { send: vi.fn(async () => undefined) };
  const scheduler = { register: vi.fn() };
  const realtime = { emit: vi.fn() };
  const activity = { activity$: { pipe: () => ({ subscribe: vi.fn() }) } };
  const service = new AchievementsService(
    db as never,
    config as never,
    users as never,
    notifications as never,
    scheduler as never,
    realtime as never,
    activity as never,
  );
  service.register({
    id: 'test.plays',
    module: 'test',
    measure: async () => 25,
    tiers: [{ goal: 10, icon: '🎵', title: { en: 'Ten' }, description: { en: '10 plays' } }],
  });
  return { service, insert, insertValues, notifications, activity };
}

describe('AchievementsService', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('unlocks reached tiers and announces them on a server', async () => {
    const { service, insert, notifications } = setup('server');
    const { values } = await service.evaluate('user');
    expect(values.get('test.plays')).toBe(25);
    expect(insert).toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });

  it('records a visit day when the list is opened', async () => {
    const { service, insertValues } = setup('server');
    await service.list('user');
    expect(insertValues).toHaveBeenCalledWith({
      userId: 'user',
      day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it('only measures progress on a sync client: unlocking is the server’s job', async () => {
    const { service, insert, notifications } = setup('client');
    const { values, unlocked } = await service.evaluate('user');
    expect(values.get('test.plays')).toBe(25);
    expect(unlocked.size).toBe(0);
    expect(insert).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('does not react to user activity on a sync client', () => {
    const client = setup('client');
    const pipe = vi.spyOn(client.activity.activity$, 'pipe');
    client.service.onModuleInit();
    expect(pipe).not.toHaveBeenCalled();
  });
});
