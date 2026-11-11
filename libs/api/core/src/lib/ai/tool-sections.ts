import {AiTool} from './ai-tool';
import {ToolDefinition} from './openai-compatible.client';

/**
 * OpenAI refuses a request with more tools than this ("Invalid 'tools': array too long"), and
 * the dashboard has more. Past it the largest sections are folded into one tool, `open_section`,
 * and their tools come in the next round once the model opens them.
 */
export const MAX_TOOLS = 128;

export const OPEN_SECTION = 'open_section';

/**
 * The tools offered in one round: all of them while they fit in `limit`; otherwise the largest
 * sections not opened yet are folded, one by one, until the rest and `open_section` fit.
 */
export function offeredTools(
  tools: AiTool[],
  opened: ReadonlySet<string>,
  limit = MAX_TOOLS,
): ToolDefinition[] {
  if (tools.length <= limit) {
    return tools.map(toDefinition);
  }
  const sizes = new Map<string, number>();
  tools.forEach(tool =>
    sizes.set(tool.module, (sizes.get(tool.module) ?? 0) + 1),
  );
  const foldable = [...sizes.keys()]
    .filter(module => !opened.has(module))
    .sort((a, b) => sizes.get(b)! - sizes.get(a)!);
  const folded: string[] = [];
  // One place is kept for open_section itself.
  let count = tools.length + 1;
  for (const module of foldable) {
    if (count <= limit) {
      break;
    }
    folded.push(module);
    count -= sizes.get(module)!;
  }
  const shown = tools
    .filter(tool => !folded.includes(tool.module))
    .map(toDefinition);
  // The opened sections alone may still be too many: better fewer tools than no answer.
  if (folded.length === 0) {
    return shown.slice(0, limit);
  }
  return [...shown.slice(0, limit - 1), openSection(folded.sort())];
}

/** The section the model asked to open, or null if it named one that does not exist. */
export function sectionToOpen(rawArgs: string, tools: AiTool[]): string | null {
  try {
    const {section} = JSON.parse(rawArgs) as {section?: unknown};
    return tools.some(tool => tool.module === section)
      ? (section as string)
      : null;
  } catch {
    return null;
  }
}

export function toDefinition(tool: AiTool): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function openSection(sections: string[]): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: OPEN_SECTION,
      description:
        'Opens a section of the dashboard whose tools are not listed yet: its tools become ' +
        `available in the next step. Sections: ${sections.join(', ')}.`,
      parameters: {
        type: 'object',
        properties: {section: {type: 'string', enum: sections}},
        required: ['section'],
      },
    },
  };
}
