import {AiTool, NO_PARAMETERS} from './ai-tool';
import {ChatMessage, ToolDefinition} from './openai-compatible.client';
import {runToolLoop} from './tool-loop';
import {OPEN_SECTION, offeredTools} from './tool-sections';

function toolsOf(module: string, count: number): AiTool[] {
  return Array.from({length: count}, (_, i) => ({
    name: `${module}_${i}`,
    module,
    description: `${module} ${i}`,
    parameters: NO_PARAMETERS,
    handler: async () => ({module, i}),
  }));
}

const names = (offered: ToolDefinition[]) =>
  offered.map(one => one.function.name);

describe('offeredTools', () => {
  it('offers every tool while they fit', () => {
    const tools = [...toolsOf('diary', 3), ...toolsOf('tasks', 2)];
    expect(names(offeredTools(tools, new Set(), 5))).toEqual(
      tools.map(tool => tool.name),
    );
  });

  it('folds the largest sections into one tool when there are too many', () => {
    const tools = [
      ...toolsOf('finance', 6),
      ...toolsOf('life', 4),
      ...toolsOf('diary', 2),
    ];
    const offered = offeredTools(tools, new Set(), 8);

    expect(offered.length).toBeLessThanOrEqual(8);
    expect(names(offered)).toContain(OPEN_SECTION);
    expect(names(offered)).not.toContain('finance_0');
    expect(names(offered)).toContain('diary_0');
    const open = offered.find(one => one.function.name === OPEN_SECTION)!;
    expect(JSON.stringify(open.function.parameters)).toContain('finance');
  });

  it('keeps an opened section unfolded', () => {
    const tools = [
      ...toolsOf('finance', 6),
      ...toolsOf('life', 4),
      ...toolsOf('diary', 2),
    ];
    const offered = offeredTools(tools, new Set(['finance']), 8);

    expect(offered.length).toBeLessThanOrEqual(8);
    expect(names(offered)).toContain('finance_5');
    expect(names(offered)).not.toContain('life_0');
  });
});

describe('runToolLoop with folded sections', () => {
  it('opens a section and then calls its tool', async () => {
    const tools = [
      ...toolsOf('finance', 6),
      ...toolsOf('life', 4),
      ...toolsOf('diary', 2),
    ];
    const offeredPerRound: string[][] = [];
    const replies: Extract<ChatMessage, {role: 'assistant'}>[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: {name: OPEN_SECTION, arguments: '{"section":"finance"}'},
          },
        ],
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c2',
            type: 'function',
            function: {name: 'finance_3', arguments: '{}'},
          },
        ],
      },
      {role: 'assistant', content: 'Готово'},
    ];
    const ran: string[] = [];

    const result = await runToolLoop({
      messages: [{role: 'user', content: 'Сколько я потратил?'}],
      tools,
      complete: async (_messages, offered) => {
        offeredPerRound.push(names(offered));
        return replies.shift()!;
      },
      runTool: async tool => {
        ran.push(tool!.name);
        return '{}';
      },
      maxRounds: 5,
      maxTools: 8,
    });

    expect(result).toEqual({reply: 'Готово', toolsUsed: ['finance']});
    expect(ran).toEqual(['finance_3']);
    expect(offeredPerRound[0]).not.toContain('finance_3');
    expect(offeredPerRound[1]).toContain('finance_3');
    expect(offeredPerRound.every(round => round.length <= 8)).toBe(true);
  });
});
