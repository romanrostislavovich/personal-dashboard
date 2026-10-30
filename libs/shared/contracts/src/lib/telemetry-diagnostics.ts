import {z} from 'zod';

/**
 * What the desktop app tells the page about its digital telemetry (`window.desktop.telemetry
 * .diagnostics()`): only what it saw since it started. `accepted` means the server took the
 * request, not that a row was written.
 */
export const desktopTelemetryDiagnosticsSchema = z.object({
  deviceId: z.string().nullable(),
  version: z.string().nullable(),
  supported: z.boolean(),
  registered: z.boolean(),
  serverConfigured: z.boolean(),
  telemetryConsent: z.boolean(),
  smartBreakConsent: z.boolean(),
  collection: z.enum([
    'unsupported',
    'unregistered',
    'no-server',
    'consent-required',
    'stopped',
    'paused',
    'locked',
    'suspended',
    'idle',
    'private-window',
    'excluded-app',
    'waiting-window',
    'collecting',
  ]),
  sources: z.enum(['stopped', 'starting', 'running', 'error']),
  pendingBuckets: z.number().int().nonnegative(),
  lastAttemptAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastHttpStatus: z.number().int().min(100).max(599).nullable(),
  delivery: z.enum(['never', 'sending', 'accepted', 'failed']),
});

export type DesktopTelemetryDiagnostics = z.infer<
  typeof desktopTelemetryDiagnosticsSchema
>;
