import {
  ACTIVITY_CONTEXT_RETENTION_DAYS,
  sanitizeTelemetryText,
  sanitizeTelemetryUrl,
  TelemetryBucket,
  WorkstateCapture,
  workstateCaptureSchema,
  WorkstateRestorePlan,
  workstateProjectPathSchema,
  workstateRestorePlanSchema,
} from '@pd/contracts';

export function contextCutoff(now = Date.now()): Date {
  return new Date(now - ACTIVITY_CONTEXT_RETENTION_DAYS * 86_400_000);
}

function isPrivate(value: string, words: string[]): boolean {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    /* Also check the original text. */
  }
  return words.some(
    word =>
      word.trim() &&
      `${value} ${decoded}`.toLowerCase().includes(word.trim().toLowerCase()),
  );
}

function cleanText(
  value: string | undefined,
  words: string[],
): string | undefined {
  if (!value || isPrivate(value, words)) return undefined;
  const clean = sanitizeTelemetryText(value);
  return clean && !isPrivate(clean, words) ? clean : undefined;
}

function cleanUrl(value: string, words: string[]): string | null {
  if (isPrivate(value, words)) return null;
  const url = sanitizeTelemetryUrl(value);
  return url && !isPrivate(url, words) ? url : null;
}

export function sanitizeWorkstate(
  capture: WorkstateCapture,
  words: string[],
): WorkstateCapture {
  const input = workstateCaptureSchema.parse(capture);
  const path = cleanText(input.projectPath, words);
  return {
    activeApp: cleanText(input.activeApp, words),
    windowTitle: cleanText(input.windowTitle, words),
    projectPath:
      path && workstateProjectPathSchema.safeParse(path).success
        ? path
        : undefined,
    gitBranch: cleanText(input.gitBranch, words),
    browserUrls: [
      ...new Set(
        input.browserUrls
          .map(url => cleanUrl(url, words))
          .filter((url): url is string => url !== null),
      ),
    ],
    note: cleanText(input.note, words),
  };
}

export function sanitizeTelemetryPage(
  page: TelemetryBucket['page'],
  words: string[],
): TelemetryBucket['page'] {
  if (!page) return undefined;
  const url = cleanUrl(page.url, words);
  if (!url) return undefined;
  return {
    url,
    title: cleanText(page.title, words),
    type: page.type,
    technologies: page.technologies
      ?.map(value => cleanText(value, words))
      .filter((value): value is string => value !== undefined),
  };
}

export function restorePlan(
  id: string,
  capture: WorkstateCapture,
): WorkstateRestorePlan {
  const safe = sanitizeWorkstate(capture, []);
  const actions: WorkstateRestorePlan['actions'] = safe.browserUrls.map(
    url => ({
      kind: 'openUrl',
      url,
    }),
  );
  if (safe.projectPath)
    actions.push({kind: 'openProject', path: safe.projectPath});
  for (const field of [
    'activeApp',
    'windowTitle',
    'gitBranch',
    'note',
  ] as const) {
    const text = safe[field];
    if (text) actions.push({kind: 'reference', field, text});
  }
  return workstateRestorePlanSchema.parse({
    workstateId: id,
    requiresConfirmation: true,
    actions,
  });
}
