import {telemetryApi} from '@pd/client-core';
import {TelemetryBucket, telemetryBucketSchema} from '@pd/contracts';
import {safeKnowledgeMetadata} from '../shared/knowledge-meta';
import {
  allowedTelemetryUrl,
  boundedTelemetryQueue,
  telemetrySenderAllowed,
} from '../shared/telemetry-gates';
import {serverUrl, signedInClient} from './account';
import {
  clearTelemetryConsent,
  TELEMETRY_CONSENT,
  TELEMETRY_EXCLUDED,
  TELEMETRY_QUEUE,
  telemetryExclusive,
} from './telemetry-state';

export const TELEMETRY_ALARM = 'engagement-upload';
interface Consent {
  owner: string;
  epoch: string;
}
interface Lease {
  token: string;
  epoch: string;
  document: string;
  tab: number;
  url: string;
  at: number;
}
let lease: Lease | null = null;
let revision = 0;

export function invalidateEngagement(): void {
  lease = null;
  revision++;
}

export async function scheduleTelemetry(): Promise<void> {
  if (!(await chrome.alarms.get(TELEMETRY_ALARM))) {
    await chrome.alarms.create(TELEMETRY_ALARM, {
      delayInMinutes: 5,
      periodInMinutes: 5,
    });
  }
}

async function identity() {
  const client = await signedInClient();
  const user = await client.offlineUser();
  const server = await serverUrl();
  if (!user?.id || !server) throw new Error('No telemetry identity');
  return {client, owner: JSON.stringify([server, user.id])};
}

async function consent(): Promise<Consent | null> {
  const value = object(
    (await chrome.storage.local.get(TELEMETRY_CONSENT))[TELEMETRY_CONSENT],
  );
  if (
    !value ||
    typeof value.owner !== 'string' ||
    typeof value.epoch !== 'string'
  )
    return null;
  const account = await identity().catch(() => null);
  if (account?.owner !== value.owner) {
    await clearTelemetryConsent();
    invalidateEngagement();
    return null;
  }
  return {owner: value.owner, epoch: value.epoch};
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function exclusions(): Promise<{
  excluded: string[];
  privateWords: string[];
}> {
  const values = await chrome.storage.local.get([
    TELEMETRY_EXCLUDED,
    'neverSave',
    'browserConfig',
  ]);
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.toLowerCase())
      : [];
  return {
    excluded: [
      ...strings(values[TELEMETRY_EXCLUDED]),
      ...strings(values['neverSave']),
    ],
    privateWords: strings(object(values['browserConfig']).privateWords),
  };
}

export function telemetrySettings(
  url?: string,
): Promise<{enabled: boolean; excluded: boolean}> {
  return telemetryExclusive(async () => {
    const rules = await exclusions();
    return {
      enabled: !!(await consent()),
      excluded:
        !!url && !allowedTelemetryUrl(url, rules.excluded, rules.privateWords),
    };
  });
}

export function setTelemetryConsent(enabled: boolean): Promise<void> {
  invalidateEngagement();
  return telemetryExclusive(async () => {
    await clearTelemetryConsent();
    if (enabled) {
      const {owner} = await identity();
      await chrome.storage.local.set({
        [TELEMETRY_CONSENT]: {owner, epoch: crypto.randomUUID()},
      });
    }
    await resetPages();
  });
}

export function excludeTelemetrySite(
  url: string,
  excluded: boolean,
): Promise<void> {
  invalidateEngagement();
  return telemetryExclusive(async () => {
    const host = new URL(url).hostname;
    const values = (await chrome.storage.local.get(TELEMETRY_EXCLUDED))[
      TELEMETRY_EXCLUDED
    ];
    const sites: string[] = Array.isArray(values)
      ? values.filter((site): site is string => typeof site === 'string')
      : [];
    const updated = [
      ...new Set([
        ...sites.filter(site => site !== host),
        ...(excluded ? [host] : []),
      ]),
    ];
    if (updated.length > 200) throw new Error('Too many excluded sites');
    await chrome.storage.local.set({[TELEMETRY_EXCLUDED]: updated});
    // A privacy change discards pending aggregates instead of risking an excluded upload.
    await chrome.storage.session.remove(TELEMETRY_QUEUE);
    await resetPages();
  });
}

async function resetPages(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(tab =>
      tab.id === undefined
        ? undefined
        : chrome.tabs
            .sendMessage(tab.id, {type: 'telemetry-reset'})
            .catch(() => undefined),
    ),
  );
}

export function receiveEngagement(
  report: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<{lease: string} | null> {
  return telemetryExclusive(async () => {
    const before = revision;
    const permission = await consent();
    if (
      !permission ||
      sender.tab?.id === undefined ||
      !sender.documentId ||
      chrome.extension.inIncognitoContext
    )
      return null;
    const tab = await chrome.tabs.get(sender.tab.id).catch(() => null);
    if (!tab?.url || tab.id === undefined) return null;
    const window = await chrome.windows.get(tab.windowId);
    const idle = await chrome.idle.queryState(60);
    const rules = await exclusions();
    if (
      before !== revision ||
      !telemetrySenderAllowed(
        sender,
        tab,
        chrome.runtime.id,
        window.focused,
        idle === 'active',
      )
    ) {
      invalidateEngagement();
      return null;
    }
    const url = allowedTelemetryUrl(
      tab.url,
      rules.excluded,
      rules.privateWords,
    );
    if (!url) {
      invalidateEngagement();
      return null;
    }
    const now = Date.now();
    const previous = lease;
    lease = null;
    const next: Lease = {
      token: crypto.randomUUID(),
      epoch: permission.epoch,
      document: sender.documentId,
      tab: tab.id,
      url,
      at: now,
    };
    const bucket = engagementBucket(report, previous, next);
    if (bucket) {
      const buckets = await readQueue(permission);
      if (before !== revision) return null;
      await chrome.storage.session.set({
        [TELEMETRY_QUEUE]: {
          epoch: permission.epoch,
          buckets: boundedTelemetryQueue([...buckets, bucket], now),
        },
      });
    }
    if (before !== revision) return null;
    lease = next;
    return {lease: lease.token};
  });
}

function engagementBucket(
  report: unknown,
  previous: Lease | null,
  next: Lease,
): TelemetryBucket | null {
  const candidate = object(report);
  if (
    !previous ||
    previous.token !== candidate['lease'] ||
    previous.epoch !== next.epoch ||
    previous.tab !== next.tab ||
    previous.document !== next.document ||
    previous.url !== next.url ||
    next.at <= previous.at ||
    next.at - previous.at > 20_000
  )
    return null;
  const parsed = telemetryBucketSchema.safeParse({
    id: crypto.randomUUID(),
    source: 'browser',
    startedAt: new Date(previous.at).toISOString(),
    endedAt: new Date(next.at).toISOString(),
    metrics: {
      readingSeconds: candidate['readingSeconds'],
      scrollDepthPercent: candidate['scrollDepthPercent'],
      copyCount: candidate['copyCount'],
    },
    page: {url: next.url, ...safeKnowledgeMetadata(candidate['metadata'])},
  });
  return parsed.success &&
    ((parsed.data.metrics.readingSeconds ?? 0) > 0 ||
      (parsed.data.metrics.copyCount ?? 0) > 0)
    ? parsed.data
    : null;
}

async function readQueue(permission: Consent): Promise<TelemetryBucket[]> {
  const value = object(
    (await chrome.storage.session.get(TELEMETRY_QUEUE))[TELEMETRY_QUEUE],
  );
  return value.epoch === permission.epoch
    ? boundedTelemetryQueue(value.buckets, Date.now())
    : [];
}

export function uploadTelemetry(): Promise<void> {
  return telemetryExclusive(async () => {
    const permission = await consent();
    if (!permission || chrome.extension.inIncognitoContext) {
      await chrome.storage.session.remove(TELEMETRY_QUEUE);
      return;
    }
    const rules = await exclusions();
    const buckets = (await readQueue(permission)).filter(
      bucket =>
        !!bucket.page &&
        allowedTelemetryUrl(
          bucket.page.url,
          rules.excluded,
          rules.privateWords,
        ),
    );
    await chrome.storage.session.set({
      [TELEMETRY_QUEUE]: {epoch: permission.epoch, buckets},
    });
    if (!buckets.length) return;
    const {client, owner} = await identity();
    if (owner !== permission.owner) {
      await clearTelemetryConsent();
      return;
    }
    // Keep the same IDs until acknowledged: a lost response is retried by the next alarm.
    await telemetryApi(client.api).record(buckets);
    await chrome.storage.session.remove(TELEMETRY_QUEUE);
  });
}
