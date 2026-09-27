import { AiTool } from './ai-tool';
import { ChatMessage, ToolDefinition } from './openai-compatible.client';

type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }>;

export interface ToolLoopOptions {
  messages: ChatMessage[];
  tools: AiTool[];
  /** A request to the model (chatCompletion in production). */
  complete: (messages: ChatMessage[], tools: ToolDefinition[]) => Promise<AssistantMessage>;
  /** Runs a tool; returns a JSON string for the model. */
  runTool: (tool: AiTool | undefined, rawArgs: string) => Promise<string>;
  maxRounds: number;
}

/**
 * Function calling loop: while the model asks for tools, run them and send
 * the results back. If it still has not answered after `maxRounds`, ask it to answer
 * without tools using what has been collected so far.
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
