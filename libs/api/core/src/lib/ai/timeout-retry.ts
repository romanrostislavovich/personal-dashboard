/** The error `AbortSignal.timeout` aborts a request with: the provider took too long. */
export function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/**
 * Runs a request to the model and, when it timed out, once more. A provider that hangs on one
 * request usually answers the next one at once; any other failure is thrown right away.
 * For background jobs only: a person waiting in a chat should not wait twice as long.
 */
export async function retryOnceOnTimeout<T>(
  request: () => Promise<T>,
  onTimeout?: (error: unknown) => void,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isTimeout(error)) {
      throw error;
    }
    onTimeout?.(error);
    return request();
  }
}
