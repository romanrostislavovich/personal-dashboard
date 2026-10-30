/*
 * The Model Context Protocol, the part a server of tools needs: JSON-RPC 2.0 over HTTP POST
 * (the "Streamable HTTP" transport answering with plain JSON, without a stream) — `initialize`,
 * `ping`, `tools/list` and `tools/call`. Small enough to keep here instead of a dependency;
 * https://modelcontextprotocol.io/specification describes the rest.
 */

/** The versions this server speaks, newest first; a client asking for another gets the newest. */
const MCP_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Only reads; changes data; deletes or overwrites (a client may ask before such a call). */
  readOnly: boolean;
  destructive: boolean;
}

/** What the tools are for this caller: listed, and run. */
export interface McpTools {
  list(): Promise<McpTool[]>;
  call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{text: string; isError: boolean}>;
}

interface Request {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type Response =
  | {jsonrpc: '2.0'; id: string | number | null; result: unknown}
  | {
      jsonrpc: '2.0';
      id: string | number | null;
      error: {code: number; message: string};
    };

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const SERVER = {name: 'personal-dashboard', version: '1.0.0'};
const INSTRUCTIONS =
  "The tools of a personal dashboard: the user's own finance, tasks, diary, health, habits, " +
  'time at the computer and in the browser, music, games, projects and more. Each tool tells ' +
  "what it returns. Dates are YYYY-MM-DD in the user's time zone. A tool that deletes or " +
  'overwrites answers "confirmationRequired" first and changes nothing: ask the user, and if ' +
  'they agree, call it again with the same arguments.';

/**
 * Answers one message, or a batch of them; `null` — nothing to answer (only notifications,
 * which the transport acknowledges with 202).
 */
export async function answerMcp(
  body: unknown,
  tools: McpTools,
): Promise<Response | Response[] | null> {
  if (Array.isArray(body)) {
    const answers = (
      await Promise.all(body.map(one => answerOne(one, tools)))
    ).filter((one): one is Response => one !== null);
    return answers.length ? answers : null;
  }
  return answerOne(body, tools);
}

async function answerOne(
  message: unknown,
  tools: McpTools,
): Promise<Response | null> {
  if (!isRequest(message)) {
    return failure(null, INVALID_REQUEST, 'Expected a JSON-RPC 2.0 request');
  }
  // A notification (no id) is never answered: `notifications/initialized`, a cancellation…
  if (message.id === undefined) {
    return null;
  }
  const id = message.id;
  const params = message.params ?? {};
  switch (message.method) {
    case 'initialize': {
      const asked =
        typeof params['protocolVersion'] === 'string'
          ? params['protocolVersion']
          : '';
      return success(id, {
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: {tools: {listChanged: false}},
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return success(id, {});
    case 'tools/list':
      return success(id, {
        tools: (await tools.list()).map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: {
            readOnlyHint: tool.readOnly,
            destructiveHint: tool.destructive,
          },
        })),
      });
    case 'tools/call': {
      const name = params['name'];
      const args = params['arguments'] ?? {};
      if (
        typeof name !== 'string' ||
        typeof args !== 'object' ||
        Array.isArray(args)
      ) {
        return failure(id, INVALID_PARAMS, 'Expected { name, arguments }');
      }
      const {text, isError} = await tools.call(
        name,
        args as Record<string, unknown>,
      );
      return success(id, {content: [{type: 'text', text}], isError});
    }
    default:
      return failure(id, METHOD_NOT_FOUND, `No method ${message.method}`);
  }
}

function isRequest(message: unknown): message is Request {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as Request).jsonrpc === '2.0' &&
    typeof (message as Request).method === 'string'
  );
}

function success(id: string | number | null, result: unknown): Response {
  return {jsonrpc: '2.0', id, result};
}

function failure(
  id: string | number | null,
  code: number,
  message: string,
): Response {
  return {jsonrpc: '2.0', id, error: {code, message}};
}
