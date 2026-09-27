import { AiTool, NO_PARAMETERS } from './ai-tool';
import { ChatMessage } from './openai-compatible.client';
import { runToolLoop } from './tool-loop';

const diaryTool: AiTool = {
  name: 'diary_stats',
  module: 'diary',
  description: 'stats',
  parameters: NO_PARAMETERS,
  handler: async () => ({ streak: 5 }),
};

const callDiary = {
  role: 'assistant' as const,
  content: null,
  tool_calls: [
    { id: 'call_1', type: 'function' as const, function: { name: 'diary_stats', arguments: '{}' } },
  ],
};

/** Stub model: returns prepared answers one by one. */
function scripted(...replies: Extract<ChatMessage, { role: 'assistant' }>[]) {
  return async () => {
    const next = replies.shift();
    if (!next) {
      throw new Error('No more scripted replies');
    }
    return next;
  };
}

describe('runToolLoop', () => {
  it('runs requested tools and returns the final answer', async () => {
    const seen: ChatMessage[][] = [];
    const reply = scripted(callDiary, { role: 'assistant', content: 'Серия — 5 дней' });
    const result = await runToolLoop({
      messages: [{ role: 'user', content: 'Какая серия?' }],
      tools: [diaryTool],
      complete: async (messages) => {
        seen.push(messages);
        return reply();
      },
      runTool: async (tool) => JSON.stringify(await tool?.handler('u1', {})),
      maxRounds: 3,
    });

    expect(result).toEqual({ reply: 'Серия — 5 дней', toolsUsed: ['diary'] });
    // In the second request the model sees its own call and the tool result.
    expect(seen[1].at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"streak":5}',
    });
  });

  it('forces an answer without tools after maxRounds', async () => {
    let lastTools: unknown[] = [];
    const result = await runToolLoop({
      messages: [{ role: 'user', content: '?' }],
      tools: [diaryTool],
      complete: async (_messages, tools) => {
        lastTools = tools;
        return tools.length ? callDiary : { role: 'assistant', content: 'Итог' };
      },
      runTool: async () => '{}',
      maxRounds: 2,
    });

    expect(result.reply).toBe('Итог');
    expect(lastTools).toEqual([]);
  });

  it('reports unknown tools to the model instead of failing', async () => {
    const unknownCall = {
      ...callDiary,
      tool_calls: [{ ...callDiary.tool_calls[0], function: { name: 'nope', arguments: '{}' } }],
    };
    const reply = scripted(unknownCall, { role: 'assistant', content: 'ok' });
    const runTool = vi.fn(async () => '{"error":"Unknown tool"}');
    await runToolLoop({
      messages: [{ role: 'user', content: '?' }],
      tools: [diaryTool],
      complete: reply,
      runTool,
      maxRounds: 3,
    });
    expect(runTool).toHaveBeenCalledWith(undefined, '{}');
  });
});
