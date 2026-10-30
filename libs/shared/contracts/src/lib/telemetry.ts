import {z} from 'zod';

const sensitive =
  /(?:password|passwd|secret|token|bearer|api[_-]?key|authorization|session|credential|private[_-]?key|-----BEGIN|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\d[ -]?){7,}\b)/i;
const privatePath =
  /(?:^|\/)(?:login|signin|auth|oauth|account|profile|checkout|cart|payment|billing|mail|messages?|chat|inbox|settings|reset|invite)(?:\/|$)/i;

/** Conservative opt-in metadata filter, not a general-purpose PII classifier. */
export function sanitizeTelemetryText(text: string): string | null {
  const value = text
    .split('')
    .map(char =>
      char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char,
    )
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (
    !value ||
    value.length > 160 ||
    sensitive.test(value) ||
    /[a-z\d_+/=-]{32,}/i.test(value)
  ) {
    return null;
  }
  return value;
}

/** No credentials, queries, fragments, local addresses or obvious private resource paths. */
export function sanitizeTelemetryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = decodeURIComponent(url.pathname);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !/^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) ||
      /^\d+(?:\.\d+){3}$/.test(host) ||
      url.port ||
      privatePath.test(path) ||
      !sanitizeTelemetryText(path) ||
      [...path].some(
        char =>
          char === '\\' ||
          char.charCodeAt(0) < 32 ||
          char.charCodeAt(0) === 127,
      )
    ) {
      return null;
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

const count = z.number().int().min(0).max(1_000_000);
const milliseconds = z.number().min(0).max(300_000);
export const telemetryMetricsSchema = z
  .object({
    inputCount: count.optional(),
    backspaceCount: count.optional(),
    backspaceBursts: count.optional(),
    pauseMeanMs: milliseconds.optional(),
    pauseVarianceMs2: z.number().min(0).max(90_000_000_000).optional(),
    contextSwitches: count.optional(),
    focusSeconds: z.number().min(0).max(300).optional(),
    focusEntropy: z.number().min(0).max(32).optional(),
    uniqueApps: count.optional(),
    terminalCommands: count.optional(),
    terminalFailures: count.optional(),
    buildWaitMs: milliseconds.optional(),
    readingSeconds: z.number().min(0).max(300).optional(),
    scrollDepthPercent: z.number().min(0).max(100).optional(),
    copyCount: count.optional(),
  })
  .strict();

const safeText = z
  .string()
  .refine(value => sanitizeTelemetryText(value) === value, 'Unsafe metadata');
export const telemetryBucketSchema = z
  .object({
    id: z.uuid(),
    source: z.enum(['desktop', 'browser']),
    startedAt: z.iso.datetime({offset: true}),
    endedAt: z.iso.datetime({offset: true}),
    metrics: telemetryMetricsSchema,
    page: z
      .object({
        url: z
          .string()
          .max(2048)
          .refine(value => sanitizeTelemetryUrl(value) === value, 'Unsafe URL'),
        title: safeText.optional(),
        type: z
          .enum(['article', 'website', 'tech-article', 'video', 'course'])
          .optional(),
        technologies: z.array(safeText).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((bucket, ctx) => {
    const duration = Date.parse(bucket.endedAt) - Date.parse(bucket.startedAt);
    if (duration <= 0 || duration > 300_000) {
      ctx.addIssue({
        code: 'custom',
        message: 'Buckets must span 0–5 minutes',
        path: ['endedAt'],
      });
    }
    if (bucket.source === 'desktop' && bucket.page) {
      ctx.addIssue({
        code: 'custom',
        message: 'Desktop buckets contain aggregates only',
        path: ['page'],
      });
    }
    for (const key of ['focusSeconds', 'readingSeconds'] as const) {
      if ((bucket.metrics[key] ?? 0) > duration / 1000 + 0.001) {
        ctx.addIssue({
          code: 'custom',
          message: 'Active time exceeds bucket duration',
          path: ['metrics', key],
        });
      }
    }
    if (
      (bucket.metrics.terminalFailures ?? 0) >
      (bucket.metrics.terminalCommands ?? 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Failures exceed commands',
        path: ['metrics'],
      });
    }
  });
export type TelemetryBucket = z.infer<typeof telemetryBucketSchema>;
export type TelemetryMetrics = z.infer<typeof telemetryMetricsSchema>;

export const telemetryIngestSchema = z
  .object({buckets: z.array(telemetryBucketSchema).max(100)})
  .strict();
export type TelemetryIngest = z.infer<typeof telemetryIngestSchema>;
