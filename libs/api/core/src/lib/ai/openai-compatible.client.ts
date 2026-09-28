/** A message in Chat Completions format (OpenAI, DeepSeek, Ollama, etc.). */
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatConnection {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  /**
   * OpenAI reasoning models (GPT-6) call tools in Chat Completions only with `none`, and reject
   * `temperature` otherwise. Other providers do not know the parameter, so it is not sent to them.
   */
  reasoningEffort?: 'none';
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 120_000;

/** A single `POST {baseUrl}/chat/completions` request; returns the assistant message. */
export async function chatCompletion(
  connection: ChatConnection,
  messages: ChatMessage[],
  tools: ToolDefinition[] = [],
): Promise<Extract<ChatMessage, { role: 'assistant' }>> {
  const response = await fetch(`${connection.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: connection.model,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(connection.reasoningEffort ? { reasoning_effort: connection.reasoningEffort } : {}),
      temperature: 0.3,
    }),
  });
  if (!response.ok) {
    throw new AiRequestError(
      `AI API ${response.status}: ${await response.text()}`,
      response.status,
    );
  }
  const data = (await response.json()) as {
    choices: { message: Extract<ChatMessage, { role: 'assistant' }> }[];
  };
  return data.choices[0].message;
}
