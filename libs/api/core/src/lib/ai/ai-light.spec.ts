import {AiService} from './ai.service';
import type {ChatConnection, ChatMessage} from './openai-compatible.client';

/** AiService with only what `complete()` touches; the rest is never called here. */
function serviceWith(options: {
  light: ChatConnection | null;
  own?: ChatConnection | null;
}) {
  const active: ChatConnection = {
    id: 'active',
    baseUrl: 'https://api',
    model: 'big',
    apiKey: 'k',
  };
  const asked: string[] = [];
  const failing = new Set<string>();
  const connections = {
    ofModule: async () => options.own ?? null,
    light: async () => options.light,
    active: async () => active,
    localFallback: async () => null,
  };
  const usage = {
    complete: async (
      _userId: string,
      connection: ChatConnection,
      _messages: ChatMessage[],
    ) => {
      asked.push(connection.id ?? '?');
      if (failing.has(connection.id ?? '')) {
        throw new Error('ECONNREFUSED');
      }
      return {role: 'assistant' as const, content: `from ${connection.id}`};
    },
  };
  const users = {findById: async () => ({locale: 'en'})};
  const service = new AiService(
    {} as never,
    connections as never,
    users as never,
    {} as never,
    {} as never,
    usage as never,
    {toolsFor: () => []} as never,
    {} as never,
  );
  // Access to the module is not what is tested.
  service.canSee = async () => true;
  return {service, asked, failing};
}

const local: ChatConnection = {
  id: 'local',
  baseUrl: 'http://ollama',
  model: 'qwen',
  apiKey: null,
};

describe('AiService.complete — light work', () => {
  it('goes to the light-task connection; writing stays with the active one', async () => {
    const {service, asked} = serviceWith({light: local});
    await expect(
      service.complete('u', 'Sort', 'x', 'finance', {light: true}),
    ).resolves.toBe('from local');
    await expect(service.complete('u', 'Write', 'x', 'finance')).resolves.toBe(
      'from active',
    );
    expect(asked).toEqual(['local', 'active']);
  });

  it('falls back to the active connection when the light one is off', async () => {
    const {service, asked, failing} = serviceWith({light: local});
    failing.add('local');
    await expect(
      service.complete('u', 'Sort', 'x', 'finance', {light: true}),
    ).resolves.toBe('from active');
    expect(asked).toEqual(['local', 'active']);
  });

  it("keeps a section's own connection above the light one", async () => {
    const own: ChatConnection = {
      id: 'own',
      baseUrl: 'http://own',
      model: 'm',
      apiKey: null,
    };
    const {service} = serviceWith({light: local, own});
    await expect(
      service.complete('u', 'Sort', 'x', 'health', {light: true}),
    ).resolves.toBe('from own');
  });

  it('uses the active connection when no light one is chosen', async () => {
    const {service} = serviceWith({light: null});
    await expect(
      service.complete('u', 'Sort', 'x', 'finance', {light: true}),
    ).resolves.toBe('from active');
  });
});
