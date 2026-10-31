/** LanguageTool on a small server answers a few checks at a time; more only queue up in it. */
export const MAX_AT_ONCE = 2;
/** After a timeout or an overload, LanguageTool is left alone this long. */
export const REST_MS = 30_000;

/**
 * What stands between the checks and LanguageTool, so it is not flooded:
 * - the same request asked again while it is with LanguageTool waits for that answer;
 * - at most MAX_AT_ONCE requests are with it, the others wait their turn;
 * - when it timed out or was overloaded, nothing is sent for REST_MS — each pause in typing
 *   would otherwise send the whole text again into a server that is already behind.
 */
export class LanguageToolGate<T> {
  private readonly pending = new Map<string, Promise<T>>();
  private readonly queue: (() => void)[] = [];
  private running = 0;
  private restUntil = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Whether LanguageTool is being left alone now. */
  resting(): boolean {
    return this.now() < this.restUntil;
  }

  run(key: string, ask: () => Promise<T>): Promise<T> {
    const known = this.pending.get(key);
    if (known) {
      return known;
    }
    const answer = this.inTurn(ask).finally(() => this.pending.delete(key));
    this.pending.set(key, answer);
    return answer;
  }

  /** Called on a timeout or an overload of LanguageTool. */
  rest(): void {
    this.restUntil = this.now() + REST_MS;
  }

  private async inTurn(ask: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_AT_ONCE) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      if (this.resting()) {
        throw new Error('LanguageTool is resting after a timeout');
      }
      return await ask();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}
