import { z } from 'zod';

export const monitorInputSchema = z.object({
  projectId: z.uuid(),
  /** Проверяемый адрес: главная страница или health-эндпоинт API. */
  url: z.url({ protocol: /^https?$/ }),
});
export type MonitorInput = z.infer<typeof monitorInputSchema>;

export type MonitorStatus = 'up' | 'down' | 'pending';

export interface ResponseTimePoint {
  /** Начало часа, ISO. */
  at: string;
  /** Среднее время ответа за час, мс. */
  avgMs: number;
}

export interface Monitor {
  id: string;
  projectId: string;
  url: string;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastResponseMs: number | null;
  lastError: string | null;
  /** С какого момента недоступен (если сейчас down). */
  downSince: string | null;
  /** Когда истекает SSL-сертификат (для https). */
  sslExpiresAt: string | null;
  /** Доля успешных проверок, 0–100; `null`, если проверок ещё не было. */
  uptime: { day: number | null; week: number | null; month: number | null };
  /** Средний ответ по часам за последние 24 часа. */
  responseTimes: ResponseTimePoint[];
}
