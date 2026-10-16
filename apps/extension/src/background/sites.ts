import { activityApi } from '@pd/client-core';
import { ActivityBrowserConfig, siteOf } from '@pd/contracts';
import { BlockReason, blockReason, isPrivateSite, Visit } from '../shared/site-rules';
import { signedInClient } from './account';
import { readJson, writeJson } from './storage';

/*
 * Time by site and the sites kept closed. What is in front — the active tab of the focused
 * window, the user there (or the tab playing sound: a video without input) — is a visit of its
 * site; the visits go to the server every minute, and the answer says what to close: the
 * distracting sites while a focus session of the desktop app runs, a site whose daily limit is
 * spent. Only the site of a page is kept, never its address or title; private windows never.
 */

export const SITES_ALARM = 'sites';
/** A visit is cut this often: Chrome closed with one open loses at most this much. */
const CUT_MS = 2 * 60_000;
/** No input for this long and nothing playing: the user is away. */
const IDLE_SECONDS = 120;
/** Visits kept while the server cannot be reached (about a day and a half of browsing). */
const MAX_QUEUE = 3000;
/** "Open anyway" lets a closed site in for this long. */
export const PASS_MS = 5 * 60_000;

const QUEUE_KEY = 'siteQueue';
const CONFIG_KEY = 'browserConfig';
/** In session storage: gone with the browser, like the visit it describes. */
const CURRENT_KEY = 'siteCurrent';
const PASSES_KEY = 'sitePasses';

interface Current {
  site: string;
  startedAt: number;
}

/** Until the server answers once: nothing closed, nothing recorded. */
const NO_CONFIG: ActivityBrowserConfig = {
  trackSites: false,
  focusUntil: null,
  distractingSites: [],
  siteLimits: [],
  privateWords: [],
};

export function scheduleSites(): void {
  void chrome.alarms.create(SITES_ALARM, { delayInMinutes: 0.5, periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(IDLE_SECONDS);
}

/** Every minute: the visit so far is cut and sent, and what to close is asked anew. */
export async function sitesTick(): Promise<void> {
  await noteFront(true);
  await send();
  await closeBlockedFront();
}

/**
 * Something changed in front (a tab, a window, the user away): the open visit ends when its
 * site is no longer there; `cut` — it ends anyway, and the same site starts a new one.
 */
export function noteFront(cut = false): Promise<void> {
  // One at a time: two events at once would both end the same visit.
  const next = noting.then(() => takeFront(cut));
  noting = next.catch(() => undefined);
  return next;
}

let noting: Promise<void> = Promise.resolve();

async function takeFront(cut: boolean): Promise<void> {
  const site = await frontSite();
  const current = await readJson<Current | null>(chrome.storage.session, CURRENT_KEY, null);
  const now = Date.now();
  if (current && current.site === site && !(cut && now - current.startedAt >= CUT_MS)) {
    return;
  }
  if (current) {
    await enqueue({
      id: crypto.randomUUID(),
      site: current.site,
      startedAt: new Date(current.startedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
    });
  }
  await writeJson(chrome.storage.session, CURRENT_KEY, site ? { site, startedAt: now } : null);
}

/** Whether a page of a tab is to be closed now, and why. */
export async function blockOf(url: string): Promise<{ site: string; block: BlockReason } | null> {
  const site = siteOf(url);
  if (!site) {
    return null;
  }
  const config = await readJson(chrome.storage.local, CONFIG_KEY, NO_CONFIG);
  const passes = await readJson<Record<string, number>>(chrome.storage.session, PASSES_KEY, {});
  const block = blockReason(config, site, new Date(), await unsentVisits(), passes);
  return block ? { site, block } : null;
}

/** "Open anyway": the site is let in for a few minutes. */
export async function passSite(site: string): Promise<void> {
  const passes = await readJson<Record<string, number>>(chrome.storage.session, PASSES_KEY, {});
  const now = Date.now();
  const kept = Object.fromEntries(Object.entries(passes).filter(([, until]) => until > now));
  await writeJson(chrome.storage.session, PASSES_KEY, { ...kept, [site]: now + PASS_MS });
}

/** A page that was just opened: the page of the extension instead, when its site is closed. */
export async function guardNavigation(tabId: number, url: string): Promise<void> {
  const found = await blockOf(url);
  if (found) {
    await chrome.tabs.update(tabId, { url: blockedPage(found.site, url) });
  }
}

/** The page shown instead of a closed site; `back` — the address to open when let in. */
export function blockedPage(site: string, back: string): string {
  const query = new URLSearchParams({ site, back });
  return chrome.runtime.getURL(`blocked.html?${query}`);
}

/** The site in front now; `null` — no browser window in front, the user away, not a site. */
async function frontSite(): Promise<string | null> {
  const config = await readJson(chrome.storage.local, CONFIG_KEY, NO_CONFIG);
  if (!config.trackSites) {
    return null;
  }
  const window = await chrome.windows.getLastFocused().catch(() => null);
  if (!window?.focused || window.incognito) {
    return null;
  }
  const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
  const site = tab?.url ? siteOf(tab.url) : null;
  if (!tab || !site || isPrivateSite(site, config.privateWords)) {
    return null;
  }
  const state = await chrome.idle.queryState(IDLE_SECONDS);
  // A video watched without touching anything is still watched.
  return state === 'active' || (state === 'idle' && tab.audible) ? site : null;
}

/** The visits not sent yet, the open one so far among them. */
async function unsentVisits(): Promise<Visit[]> {
  const queue = await readJson<Visit[]>(chrome.storage.local, QUEUE_KEY, []);
  const current = await readJson<Current | null>(chrome.storage.session, CURRENT_KEY, null);
  if (!current) {
    return queue;
  }
  const open = {
    id: 'open',
    site: current.site,
    startedAt: new Date(current.startedAt).toISOString(),
    endedAt: new Date().toISOString(),
  };
  return [...queue, open];
}

async function enqueue(visit: Visit): Promise<void> {
  if (visit.endedAt <= visit.startedAt) {
    return;
  }
  const queue = await readJson<Visit[]>(chrome.storage.local, QUEUE_KEY, []);
  await writeJson(chrome.storage.local, QUEUE_KEY, [...queue, visit].slice(-MAX_QUEUE));
}

/** What waits goes to the server (none is fine); its answer is what to follow from now. */
async function send(): Promise<void> {
  const client = await signedInClient().catch(() => null);
  if (!client) {
    // Signed out: nothing is recorded for nobody, nothing is closed.
    await writeJson(chrome.storage.local, CONFIG_KEY, NO_CONFIG);
    await writeJson(chrome.storage.local, QUEUE_KEY, []);
    return;
  }
  const queue = await readJson<Visit[]>(chrome.storage.local, QUEUE_KEY, []);
  const batch = queue.slice(0, 500);
  try {
    const answer = await activityApi(client.api).recordSites(batch);
    const config: ActivityBrowserConfig = {
      trackSites: answer.trackSites,
      focusUntil: answer.focusUntil,
      distractingSites: answer.distractingSites,
      siteLimits: answer.siteLimits,
      privateWords: answer.privateWords,
    };
    await writeJson(chrome.storage.local, CONFIG_KEY, config);
    // Visits recorded meanwhile stay for the next time.
    const sent = new Set(batch.map((visit) => visit.id));
    const now = await readJson<Visit[]>(chrome.storage.local, QUEUE_KEY, []);
    await writeJson(
      chrome.storage.local,
      QUEUE_KEY,
      now.filter((visit) => !sent.has(visit.id)),
    );
  } catch {
    // No connection: the visits wait, the last answer stays in force.
  }
}

/**
 * A focus session started or a limit ran out while the site was open: it closes now — in the
 * tabs in front and in the ones playing (a video in the background).
 */
async function closeBlockedFront(): Promise<void> {
  const tabs = [
    ...(await chrome.tabs.query({ active: true })),
    ...(await chrome.tabs.query({ audible: true })),
  ];
  const seen = new Set<number>();
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url && !tab.incognito && !seen.has(tab.id)) {
      seen.add(tab.id);
      await guardNavigation(tab.id, tab.url);
    }
  }
}
