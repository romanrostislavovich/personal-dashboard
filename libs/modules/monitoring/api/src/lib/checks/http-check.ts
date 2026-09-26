export interface HttpCheckResult {
  isUp: boolean;
  statusCode: number | null;
  /** Время до получения заголовков ответа, мс. */
  responseMs: number | null;
  error: string | null;
}

const TIMEOUT_MS = 10_000;

/** Один запрос к адресу. «Работает» = ответ 2xx/3xx быстрее таймаута. */
export async function checkHttp(url: string): Promise<HttpCheckResult> {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'personal-dashboard-uptime/1.0' },
    });
    const responseMs = Math.round(performance.now() - startedAt);
    // Тело не нужно — не скачиваем его.
    await response.body?.cancel();
    return {
      isUp: response.status < 400,
      statusCode: response.status,
      responseMs,
      error: response.status < 400 ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return {
      isUp: false,
      statusCode: null,
      responseMs: null,
      error: isTimeout ? `Timeout ${TIMEOUT_MS / 1000}s` : describeNetworkError(error),
    };
  }
}

/** fetch прячет настоящую причину (DNS, отказ соединения, TLS) в `cause`. */
function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) {
    const code = (error.cause as Error & { code?: string }).code;
    return code ?? error.cause.message;
  }
  return error instanceof Error ? error.message : String(error);
}
