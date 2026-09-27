import { z } from 'zod';

export const monitorInputSchema = z.object({
  projectId: z.uuid(),
  /** The checked address: the home page or an API health endpoint. */
  url: z.url({ protocol: /^https?$/ }),
});
export type MonitorInput = z.infer<typeof monitorInputSchema>;

export type MonitorStatus = 'up' | 'down' | 'pending';

export interface ResponseTimePoint {
  /** Start of the hour, ISO. */
  at: string;
  /** Average response time for the hour, ms. */
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
  /** Since when it has been unavailable (if it is down now). */
  downSince: string | null;
  /** When the SSL certificate expires (for https). */
  sslExpiresAt: string | null;
  /** Share of successful checks, 0–100; `null` if there have been no checks yet. */
  uptime: { day: number | null; week: number | null; month: number | null };
  /** Average response per hour over the last 24 hours. */
  responseTimes: ResponseTimePoint[];
}
