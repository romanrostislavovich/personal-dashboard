import { NotFoundException } from '@nestjs/common';
import { ServerActions } from './server-actions';

function setup(mode: 'off' | 'server' | 'client') {
  const calls: string[] = [];
  const client = {
    syncFresh: vi.fn(async () => void calls.push('sync')),
    runOnServer: vi.fn(async (_userId: string, name: string) => {
      calls.push(`server:${name}`);
      return { from: 'server' };
    }),
  };
  const actions = new ServerActions({ mode } as never, client as never);
  const handler = vi.fn(async (_userId: string, args: Record<string, unknown>) => {
    calls.push('local');
    return { from: 'here', args };
  });
  actions.register('test.refresh', handler);
  return { actions, client, handler, calls };
}

describe('ServerActions', () => {
  it('runs the handler right here on a server and without sync', async () => {
    for (const mode of ['server', 'off'] as const) {
      const { actions, client, calls } = setup(mode);
      expect(await actions.run('user', 'test.refresh', { id: 1 })).toEqual({
        from: 'here',
        args: { id: 1 },
      });
      expect(calls).toEqual(['local']);
      expect(client.runOnServer).not.toHaveBeenCalled();
    }
  });

  it('on a client: pushes local changes, runs on the server, pulls the result', async () => {
    const { actions, client, handler, calls } = setup('client');
    expect(await actions.run('user', 'test.refresh', { id: 1 })).toEqual({ from: 'server' });
    expect(calls).toEqual(['sync', 'server:test.refresh', 'sync']);
    expect(client.runOnServer).toHaveBeenCalledWith('user', 'test.refresh', { id: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects unknown actions and double registration', () => {
    const { actions } = setup('server');
    expect(() => actions.execute('user', 'test.nope', {})).toThrow(NotFoundException);
    expect(() => actions.register('test.refresh', async () => null)).toThrow(/twice/);
  });
});
