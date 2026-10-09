import { safeFetch } from '../net/outbound';

/** A message in Chat Completions format (OpenAI, DeepSeek, Ollama, etc.). */
/** A part of a message with a picture (OpenAI's format, which compatible APIs follow). */
export type ContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
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

/** Where voice messages are turned into text: `POST {baseUrl}/audio/transcriptions`. */
export interface SpeechConnection {
  baseUrl: string;
  apiKey: string | null;
  model: string;
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
  // The address is the user's: not into the server's own network (see net/outbound.ts).
  const response = await safeFetch(`${connection.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
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

export interface AudioFile {
  data: Buffer;
  /** With the extension: the API tells the format by it (Telegram voice messages are `.ogg`). */
  fileName: string;
  mimeType: string;
}

/** Speech to text (OpenAI Whisper / gpt-4o-transcribe, or any compatible server). */
export async function transcribe(
  connection: SpeechConnection,
  audio: AudioFile,
  /** ISO 639-1 (`ru`, `en`): a hint that improves accuracy. */
  language?: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(audio.data)], { type: audio.mimeType }),
    audio.fileName,
  );
  form.append('model', connection.model);
  if (language) {
    form.append('language', language);
  }
  const response = await safeFetch(
    `${connection.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {},
      body: form,
    },
  );
  if (!response.ok) {
    throw new AiRequestError(await response.text(), response.status);
  }
  const { text } = (await response.json()) as { text?: string };
  return (text ?? '').trim();
}
