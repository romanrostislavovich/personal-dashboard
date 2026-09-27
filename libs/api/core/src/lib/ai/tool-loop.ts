import { AiTool } from './ai-tool';
import { ChatMessage, ToolDefinition } from './openai-compatible.client';

type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }>;

export interface ToolLoopOptions {
  messages: ChatMessage[];
  tools: AiTool[];
  /** Запрос к модели (в проде — chatCompletion). */
  complete: (messages: ChatMessage[], tools: ToolDefinition[]) => Promise<AssistantMessage>;
  /** Выполнение инструмента; возвращает JSON-строку для модели. */
  runTool: (tool: AiTool | undefined, rawArgs: string) => Promise<string>;
  maxRounds: number;
}

/**
 * Цикл function calling: пока модель просит инструменты — выполняем их и отдаём
 * результаты обратно. Если за `maxRounds` она так и не ответила, просим ответить
 * без инструментов с тем, что уже собрано.
 */
export async function runToolLoop({
  messages,
  tools,
  complete,
  runTool,
  maxRounds,
}: ToolLoopOptions): Promise<{ reply: string; toolsUsed: string[] }> {
  const conversation = [...messages];
  const definitions = tools.map(toDefinition);
  const toolsUsed = new Set<string>();

  for (let round = 0; round < maxRounds; round++) {
    const reply = await complete(conversation, definitions);
    if (!reply.tool_calls?.length) {
      return { reply: reply.content ?? '', toolsUsed: [...toolsUsed] };
    }
    conversation.push(reply);
    for (const call of reply.tool_calls) {
      const tool = tools.find((t) => t.name === call.function.name);
      toolsUsed.add(tool?.module ?? call.function.name);
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content: await runTool(tool, call.function.arguments),
      });
    }
  }

  const final = await complete(conversation, []);
  return { reply: final.content ?? '', toolsUsed: [...toolsUsed] };
}

function toDefinition(tool: AiTool): ToolDefinition {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}
