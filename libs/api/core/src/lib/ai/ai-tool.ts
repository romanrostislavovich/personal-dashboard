/**
 * A tool through which the AI gets a module's data. A module registers
 * tools in `onModuleInit` (file `<module>.ai-tools.ts`):
 *
 * ```ts
 * ai.registerTool({
 *   name: 'diary_get_entries',
 *   module: 'diary',
 *   description: 'Diary entries for a period',
 *   parameters: { type: 'object', properties: { from: { type: 'string' } }, required: ['from'] },
 *   handler: (userId, args) => this.diary.list(userId, args),
 * });
 * ```
 *
 * The model decides which tools to call to answer the question.
 */
export interface AiTool {
  /** Latin letters, digits, `_` and `-` only; prefixed with the module id. */
  name: string;
  /** Module id — for the "looked at: diary, finance" caption. */
  module: string;
  /** Description for the model: what it returns and when it is useful. */
  description: string;
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>;
  handler: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

/** JSON Schema for a tool without arguments. */
export const NO_PARAMETERS = { type: 'object', properties: {} } as const;

/** Common case: a `from`–`to` period in YYYY-MM-DD format. */
export const PERIOD_PARAMETERS = {
  type: 'object',
  properties: {
    from: { type: 'string', description: 'Start of the period, YYYY-MM-DD' },
    to: { type: 'string', description: 'End of the period, inclusive, YYYY-MM-DD' },
  },
  required: ['from', 'to'],
} as const;
