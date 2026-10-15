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

  it('keeps a hidden section quiet, a service inside it too, and sends the rest', async () => {
    const sent: string[] = [];
    const channel = {
      name: 'test',
      isEnabledFor: () => true,
      send: async (_user: unknown, notification: { source: string }) => {
        sent.push(notification.source);
      },
    };
    const service = new NotificationsService(users as never, [channel] as never);
    for (const source of ['games', 'steam', 'finance', 'core']) {
      await service.send('u1', { title: 't', body: 'b', source });
    }
    expect(sent).toEqual(['finance', 'core']);
  });
});
