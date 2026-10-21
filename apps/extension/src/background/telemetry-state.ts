export const TELEMETRY_CONSENT = 'telemetryConsent';
export const TELEMETRY_QUEUE = 'telemetryQueue';
export const TELEMETRY_EXCLUDED = 'telemetryExcluded';

let pending: Promise<unknown> = Promise.resolve();

/** Authentication transitions and uploads share this lock, including token refresh/retry. */
export function telemetryExclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = pending.then(work);
  pending = next.catch(() => undefined);
  return next;
}

export async function clearTelemetryConsent(): Promise<void> {
  await chrome.storage.local.remove(TELEMETRY_CONSENT);
  await chrome.storage.session.remove(TELEMETRY_QUEUE);
}
