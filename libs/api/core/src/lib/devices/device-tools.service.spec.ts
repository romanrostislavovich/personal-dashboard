import {ServerToDevice} from '@pd/contracts';
import {DeviceToolsService} from './device-tools.service';

const page = {
  name: 'browser_current_page',
  description: 'The page',
  inputSchema: {type: 'object'},
};

/** A device that answers every call with its own name. */
function device(
  service: DeviceToolsService,
  id: string,
  userId: string,
  name: string,
) {
  const sent: ServerToDevice[] = [];
  service.connected({
    id,
    userId,
    kind: 'browser',
    name,
    tools: [
      page,
      {name: 'phone_steps', description: 'x', inputSchema: {}},
      {name: 'evil', description: 'x', inputSchema: {}},
    ],
    activeAt: Date.now(),
    send: message => {
      sent.push(message);
      if (message.type === 'call') {
        queueMicrotask(() => service.answered(message.id, name));
      }
    },
  });
  return sent;
}

describe('DeviceToolsService', () => {
  it('offers the tools of a user’s devices once, named by their own kind only', () => {
    const service = new DeviceToolsService();
    device(service, 'd1', 'u1', 'Chrome');
    device(service, 'd2', 'u1', 'Edge');
    device(service, 'd3', 'u2', 'Firefox');
    expect(service.toolsFor('u1').map(tool => tool.name)).toEqual([
      'browser_current_page',
    ]);
    expect(service.toolsFor('u1')[0].module).toBe('browser');
  });

  it('asks the device in use, and never another user’s', async () => {
    const service = new DeviceToolsService();
    device(service, 'd1', 'u1', 'Chrome');
    device(service, 'd2', 'u1', 'Edge');
    device(service, 'd3', 'u2', 'Firefox');
    // The device used last wins: a moment apart, as two uses within one millisecond tie.
    const now = Date.now();
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(now + 1_000);
    service.markActive('d1');
    expect(await service.call('u1', 'browser_current_page', {})).toBe('Chrome');
    vi.setSystemTime(now + 2_000);
    service.markActive('d2');
    expect(await service.call('u1', 'browser_current_page', {})).toBe('Edge');
    service.disconnected('d1');
    service.disconnected('d2');
    await expect(
      service.call('u1', 'browser_current_page', {}),
    ).rejects.toThrow('No device');
    vi.useRealTimers();
  });
});
