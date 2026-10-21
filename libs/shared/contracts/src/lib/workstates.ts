import { z } from 'zod';
import { sanitizeTelemetryText, sanitizeTelemetryUrl, TelemetryBucket } from './telemetry';

export const ACTIVITY_CONTEXT_RETENTION_DAYS = 30;
export const workstateIdSchema = z.uuid();
const instant = z.iso.datetime({ offset: true });
const text = z.string().trim().min(1).max(160);
const safeText = text.refine((value) => sanitizeTelemetryText(value) === value, 'Unsafe context');
const safeUrl = z
  .string()
  .max(2048)
  .refine((value) => sanitizeTelemetryUrl(value) === value, 'Unsafe URL');

/** Absolute local paths only; a declarative target, never a shell argument or command. */
export const workstateProjectPathSchema = safeText.refine(
  (value) =>
    /^(?:[A-Za-z]:[\\/]|\/(?![\\/]))/.test(value) &&
    (!value.startsWith('/') || !value.includes('\\')) &&
    !/[<>:"|?*`$;&\r\n]/.test(value.replace(/^[A-Za-z]:/, '')) &&
    !value.split(/[\\/]/).some((part) => part === '..' || part === '.'),
  'Unsafe project path',
);

export const workstateCaptureSchema = z
  .object({
    activeApp: text.optional(),
    windowTitle: text.optional(),
    projectPath: z.string().min(1).max(160).optional(),
    gitBranch: text.optional(),
    browserUrls: z.array(z.string().min(1).max(2048)).max(20),
    note: text.optional(),
  })
  .strict();
export type WorkstateCapture = z.infer<typeof workstateCaptureSchema>;

export const workstateInputSchema = z
  .object({
    id: workstateIdSchema,
    capturedAt: instant,
    capture: workstateCaptureSchema,
  })
  .strict();
export type WorkstateInput = z.infer<typeof workstateInputSchema>;

const pageQuery = z
  .object({
    from: instant.optional(),
    to: instant.optional(),
    limit: z
      .union([z.number(), z.string().regex(/^\d{1,3}$/)])
      .pipe(z.coerce.number<string | number>().int().min(1).max(100))
      .default(50),
    before: instant.optional(),
    beforeId: workstateIdSchema.optional(),
  })
  .strict();
const validRange = (query: { from?: string; to?: string; before?: string; beforeId?: string }) =>
  (!query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to)) &&
  Boolean(query.before) === Boolean(query.beforeId);

export const workstateQuerySchema = pageQuery
  .extend({
    search: text.optional(),
    context: text.optional(),
  })
  .strict()
  .refine(validRange, 'Invalid time range or cursor');
export type WorkstateQuery = z.input<typeof workstateQuerySchema>;
export const telemetryQuerySchema = pageQuery
  .extend({
    source: z.enum(['desktop', 'browser']).optional(),
  })
  .strict()
  .refine(validRange, 'Invalid time range or cursor');
export type TelemetryQuery = z.input<typeof telemetryQuerySchema>;

export const workstateRestoreRequestSchema = z.object({}).strict();

export const workstateSchema = workstateInputSchema.extend({ deviceId: z.uuid().nullable() });
export type Workstate = z.infer<typeof workstateSchema>;
export interface ActivityContextCursor {
  before: string;
  beforeId: string;
}
/** Search scans at most `limit` rows. Follow nextCursor even when items is empty. */
export interface WorkstatePage {
  items: Workstate[];
  nextCursor: ActivityContextCursor | null;
}
export interface TelemetryPage {
  items: (TelemetryBucket & { deviceId: string | null })[];
  nextCursor: ActivityContextCursor | null;
}

export const workstateRestorePlanSchema = z
  .object({
    workstateId: workstateIdSchema,
    requiresConfirmation: z.literal(true),
    actions: z
      .array(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('openUrl'), url: safeUrl }).strict(),
          z.object({ kind: z.literal('openProject'), path: workstateProjectPathSchema }).strict(),
          z
            .object({
              kind: z.literal('reference'),
              field: z.enum(['activeApp', 'windowTitle', 'gitBranch', 'note']),
              text: safeText,
            })
            .strict(),
        ]),
      )
      .max(25),
  })
  .strict();
export type WorkstateRestorePlan = z.infer<typeof workstateRestorePlanSchema>;
