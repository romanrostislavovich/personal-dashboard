import {answerMcp, McpTools} from './mcp-protocol';

const tools: McpTools = {
  list: async () => [
    {
      name: 'finance_spending',
      description: 'Spending',
      inputSchema: {type: 'object', properties: {}},
      readOnly: true,
      destructive: false,
    },
  ],
  call: async (name, args) =>
    name === 'finance_spending'
      ? {text: JSON.stringify({total: 12, args}), isError: false}
      : {text: '{"error":"No tool"}', isError: true},
};
const request = (id: number, method: string, params?: object) => ({
  jsonrpc: '2.0',
  id,
  method,
  params,
});

describe('MCP', () => {
  it('agrees on a version it speaks, and offers the tools', async () => {
    expect(
      await answerMcp(
        request(1, 'initialize', {protocolVersion: '2025-03-26'}),
        tools,
      ),
    ).toMatchObject({
      id: 1,
      result: {protocolVersion: '2025-03-26', capabilities: {tools: {}}},
    });
    expect(
      await answerMcp(
        request(2, 'initialize', {protocolVersion: '1999-01-01'}),
        tools,
      ),
    ).toMatchObject({
      result: {protocolVersion: '2025-06-18'},
    });
  });

  it('lists the tools with their hints and runs one', async () => {
    expect(await answerMcp(request(3, 'tools/list'), tools)).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: {
        tools: [
          {
            name: 'finance_spending',
            description: 'Spending',
            inputSchema: {type: 'object', properties: {}},
            annotations: {readOnlyHint: true, destructiveHint: false},
          },
        ],
      },
    });
    expect(
      await answerMcp(
        request(4, 'tools/call', {
          name: 'finance_spending',
          arguments: {month: '2026-10'},
        }),
        tools,
      ),
    ).toEqual({
      jsonrpc: '2.0',
      id: 4,
      result: {
        content: [
          {type: 'text', text: '{"total":12,"args":{"month":"2026-10"}}'},
        ],
        isError: false,
      },
    });
  });

  it('answers no notification, answers a batch, and tells a wrong request', async () => {
    expect(
      await answerMcp(
        {jsonrpc: '2.0', method: 'notifications/initialized'},
        tools,
      ),
    ).toBeNull();
    expect(
      await answerMcp(
        [
          request(5, 'ping'),
          {jsonrpc: '2.0', method: 'notifications/initialized'},
        ],
        tools,
      ),
    ).toEqual([{jsonrpc: '2.0', id: 5, result: {}}]);
    expect(await answerMcp(request(6, 'resources/list'), tools)).toMatchObject({
      error: {code: -32601},
    });
    expect(
      await answerMcp(request(7, 'tools/call', {name: 1}), tools),
    ).toMatchObject({
      error: {code: -32602},
    });
    expect(await answerMcp({hello: 'world'}, tools)).toMatchObject({
      error: {code: -32600},
    });
  });
});
