import { sanitizeTelemetryUrl, TelemetryBucket, telemetryBucketSchema } from '@pd/contracts';
import { isPrivateSite } from './site-rules';

export const TELEMETRY_MAX_QUEUE = 100;
export const TELEMETRY_MAX_AGE = 24 * 60 * 60_000;

export function telemetrySettingsSenderAllowed(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
  popupUrl: string,
): boolean {
  return (
    sender.id === extensionId &&
    sender.url === popupUrl &&
    !sender.tab?.incognito &&
    (sender.tab === undefined || (sender.frameId === 0 && sender.tab.url === popupUrl))
  );
}

export function allowedTelemetryUrl(
  url: string,
  excluded: string[],
  privateWords: string[],
): string | null {
  const safe = sanitizeTelemetryUrl(url);
  if (!safe) return null;
  const host = new URL(safe).hostname;
  if (
    isPrivateSite(host, privateWords) ||
    excluded.some((site) => host === site || host.endsWith(`.${site}`))
  )
    return null;
  return safe;
}

export function telemetrySenderAllowed(
  sender: chrome.runtime.MessageSender,
  tab: chrome.tabs.Tab,
  extensionId: string,
  focused: boolean,
  active: boolean,
): boolean {
  try {
    return (
      sender.id === extensionId &&
      sender.frameId === 0 &&
      !!sender.documentId &&
      !!sender.tab &&
      sender.tab.id === tab.id &&
      tab.id !== undefined &&
      !sender.tab.incognito &&
      !tab.incognito &&
      tab.active &&
      focused &&
      active &&
      !!tab.url &&
      sender.url === tab.url &&
      sender.origin === new URL(tab.url).origin &&
      sanitizeTelemetryUrl(tab.url) !== null
    );
  } catch {
    return false;
  }
}

export function boundedTelemetryQueue(value: unknown, now: number): TelemetryBucket[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(-TELEMETRY_MAX_QUEUE).flatMap((entry) => {
    const parsed = telemetryBucketSchema.safeParse(entry);
    if (
      !parsed.success ||
      parsed.data.source !== 'browser' ||
      !parsed.data.page ||
      Date.parse(parsed.data.endedAt) > now ||
      now - Date.parse(parsed.data.endedAt) > TELEMETRY_MAX_AGE ||
      seen.has(parsed.data.id)
    )
      return [];
    seen.add(parsed.data.id);
    return [parsed.data];
  });
}
