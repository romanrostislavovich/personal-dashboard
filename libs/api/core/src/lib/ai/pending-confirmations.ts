/** A confirmation request is valid for this long; then the model has to ask again. */
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

interface Pending {
  /** The `ask()` call in which the model asked the user. */
  turn: number;
  at: number;
}

/**
 * Deletions and overwrites the user was asked to confirm.
 *
 * The model cannot confirm on its own: a call runs only if the same call (tool + arguments) was
 * requested in an earlier turn, i.e. the user has written at least one message since. Whether that
 * message is a "yes" is up to the model, like every other part of the conversation.
 *
 * In memory: after a restart the model simply asks again.
 */
export class PendingConfirmations {
  private readonly pending = new Map<string, Map<string, Pending>>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * True if the call was requested in an earlier turn and has not expired; it is consumed then.
   * Otherwise the call is remembered for this turn and the user has to be asked.
   */
  confirmOrRequest(userId: string, call: string, turn: number): boolean {
    const calls = this.pending.get(userId) ?? new Map<string, Pending>();
    this.pending.set(userId, calls);
    for (const [key, { at }] of calls) {
      if (this.now() - at > CONFIRMATION_TTL_MS) {
        calls.delete(key);
      }
    }
    const requested = calls.get(call);
    if (requested && requested.turn !== turn) {
      calls.delete(call);
      return true;
    }
    calls.set(call, { turn, at: this.now() });
    return false;
  }
}

/** The same tool with the same arguments, regardless of the key order the model used. */
export function callKey(tool: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .map((key) => [key, args[key]]);
  return `${tool}:${JSON.stringify(sorted)}`;
}
