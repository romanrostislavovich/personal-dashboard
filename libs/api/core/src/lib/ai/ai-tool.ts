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
 *
 * A tool that changes data sets `writes: true`: it is offered only where the user can ask
 * for actions (the Telegram assistant and the AI chat). Validate its arguments with the contracts
 * schema — a validation error goes back to the model, which then asks the user for what is missing.
 *
 * A tool that deletes or overwrites data also sets `confirm`: the first call only describes what
 * will be affected and the model asks the user; the handler runs when the model repeats the call
 * with the same arguments after the user's next message (see PendingConfirmations).
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
  /** Changes data (adds a birthday, a transaction…). */
  writes?: boolean;
  /**
   * Deletes or overwrites data, so the user confirms it first. Returns what the call will
   * affect (the model shows it to the user); throws if there is nothing to affect.
   * Requires `writes: true`.
   */
  confirm?: (userId: string, args: Record<string, unknown>) => Promise<unknown>;
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

/** Arguments of a tool that works with one record by its id. */
export function idParameters(description: string) {
  return {
    type: 'object',
    properties: { id: { type: 'string', description } },
    required: ['id'],
  } as const;
}

/**
 * The record with the id the model passed, from a list of the user's records.
 * The error goes back to the model, which then looks the id up with a listing tool.
 */
export function findById<T extends { id: string }>(items: T[], id: unknown, what: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`${what} with id "${String(id)}" not found — look the id up first`);
  }
  return item;
}

/** Arguments without `id` — the fields to change in a partial update. */
export function changedFields(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'id'));
}
