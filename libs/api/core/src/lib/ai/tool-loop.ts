import {AiTool} from './ai-tool';
import {ChatMessage, ToolDefinition} from './openai-compatible.client';
import {
  MAX_TOOLS,
  OPEN_SECTION,
  offeredTools,
  sectionToOpen,
} from './tool-sections';

type AssistantMessage = Extract<ChatMessage, {role: 'assistant'}>;

export interface ToolLoopOptions {
  messages: ChatMessage[];
  tools: AiTool[];
  /** A request to the model (chatCompletion in production). */
  complete: (
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ) => Promise<AssistantMessage>;
  /** Runs a tool; returns a JSON string for the model. */
  runTool: (tool: AiTool | undefined, rawArgs: string) => Promise<string>;
  maxRounds: number;
  /** How many tools one request may carry (see tool-sections.ts). */
  maxTools?: number;
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
  maxTools = MAX_TOOLS,
}: ToolLoopOptions): Promise<{reply: string; toolsUsed: string[]}> {
  const conversation = [...messages];
  const toolsUsed = new Set<string>();
  /** Sections the model opened with open_section (only when the tools do not fit). */
  const opened = new Set<string>();

  for (let round = 0; round < maxRounds; round++) {
    const reply = await complete(
      conversation,
      offeredTools(tools, opened, maxTools),
    );
    if (!reply.tool_calls?.length) {
      return {reply: reply.content ?? '', toolsUsed: [...toolsUsed]};
    }
    conversation.push(reply);
    for (const call of reply.tool_calls) {
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content:
          call.function.name === OPEN_SECTION
            ? openSection(call.function.arguments, tools, opened)
            : await runOne(call.function.name, call.function.arguments),
      });
    }
  }

  const final = await complete(conversation, []);
  return {reply: final.content ?? '', toolsUsed: [...toolsUsed]};

  async function runOne(name: string, rawArgs: string): Promise<string> {
    const tool = tools.find(t => t.name === name);
    toolsUsed.add(tool?.module ?? name);
    return runTool(tool, rawArgs);
  }
}

function openSection(
  rawArgs: string,
  tools: AiTool[],
  opened: Set<string>,
): string {
  const section = sectionToOpen(rawArgs, tools);
  if (!section) {
    return JSON.stringify({error: 'No such section'});
  }
  opened.add(section);
  return JSON.stringify({opened: section});
}
