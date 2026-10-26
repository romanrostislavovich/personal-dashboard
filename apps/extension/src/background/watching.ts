import { moviesApi } from '@pd/client-core';
import { siteOf, WatchConfig, WatchHints, WatchViewInput } from '@pd/contracts';
import { isPrivateSite } from '../shared/site-rules';
import {
  takeReport,
  toViewInput,
  WATCH_GAP_MS,
  WatchReport,
  WatchSession,
  worthSending,
} from '../shared/watch-session';
import { signedInClient } from './account';
import { readJson, writeJson } from './storage';

/*
 * What plays, for Movies: the content scripts' reports made into views (see watch-session.ts),
 * sent every minute — the open ones too, as they grow (the server updates a view by its id). The
 * server's answer says whether to go on and which sites to leave alone; the private words of
 * Activity are kept out as for the sites. Never a private window, never a page's address.
 */

export const WATCH_ALARM = 'watching';
/** Views kept while the server cannot be reached. */
const MAX_QUEUE = 500;

/** In session storage: the open view of every tab, gone with the browser like the tabs. */
const OPEN_KEY = 'watchOpen';
const QUEUE_KEY = 'watchQueue';
const CONFIG_KEY = 'watchConfig';
/** The sites tracker's answer, for its private words. */
const SITES_CONFIG_KEY = 'browserConfig';

/**
 * Until the server answers once, views are noted: the server itself drops them when the user
 * switched Movies off, and the first answer comes within a minute.
 */
const FIRST_CONFIG: WatchConfig = { track: true, ignoredSites: [] };
/** Signed out: nothing is noted for nobody. */
const SIGNED_OUT: WatchConfig = { track: false, ignoredSites: [] };

export function scheduleWatching(): void {
  void chrome.alarms.create(WATCH_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
}

/**
 * On every start of the background: the alarm is made when it is missing (an extension that
 * updated itself to a version with Movies has had no install or startup event since).
 */
export function ensureWatching(): void {
  void chrome.alarms.get(WATCH_ALARM).then((alarm) => {
    if (!alarm) {
      scheduleWatching();
    }
  });
}

/** One report of a content script, about its own tab. */
export function noteWatching(
  report: WatchReport,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  // One at a time: two frames reporting at once would both start a view.
  const next = noting.then(() => take(report, sender));
  noting = next.catch(() => undefined);
  return next;
}

let noting: Promise<void> = Promise.resolve();

async function take(report: WatchReport, sender: chrome.runtime.MessageSender): Promise<void> {
  const tab = sender.tab;
  if (!tab?.url || tab.id === undefined || tab.incognito) {
    return;
  }
  const site = siteOf(tab.url);
  const config = await readJson(chrome.storage.local, CONFIG_KEY, FIRST_CONFIG);
  const privateWords =
    (await readJson<{ privateWords?: string[] }>(chrome.storage.local, SITES_CONFIG_KEY, {}))
      .privateWords ?? [];
  if (
    !site ||
    !config.track ||
    config.ignoredSites.some((ignored) => site === ignored || site.endsWith(`.${ignored}`)) ||
    isPrivateSite(site, privateWords)
  ) {
    return;
  }
  const hints = report.top && report.hints ? report.hints : await pageHints(tab.id, tab.title);
  const open = await readJson<Record<string, WatchSession>>(chrome.storage.session, OPEN_KEY, {});
  const { open: now, closed } = takeReport(
    open[tab.id] ?? null,
    report,
    { url: tab.url, site, hints },
    Date.now(),
    () => crypto.randomUUID(),
  );
  if (closed && worthSending(closed)) {
    await enqueue([toViewInput(closed)]);
  }
  await writeJson(chrome.storage.session, OPEN_KEY, { ...open, [tab.id]: now });
}

/** What the page of a tab says plays, when a player in a frame of it reports. */
async function pageHints(tabId: number, title: string | undefined): Promise<WatchHints> {
  try {
    const reply = (await chrome.tabs.sendMessage(
      tabId,
      { type: 'watch-hints' },
      { frameId: 0 },
    )) as WatchHints | undefined;
    if (reply) {
      return reply;
    }
  } catch {
    // The page's own script is not there (yet): its title will do.
  }
  return { pageTitle: title?.slice(0, 300) };
}

/** Every minute: the views over are queued, and what waits goes to the server. */
export async function watchingTick(): Promise<void> {
  await noting;
  const open = await readJson<Record<string, WatchSession>>(chrome.storage.session, OPEN_KEY, {});
  const now = Date.now();
  const still: Record<string, WatchSession> = {};
  const over: WatchViewInput[] = [];
  for (const [tabId, session] of Object.entries(open)) {
    if (now - session.lastAt >= WATCH_GAP_MS) {
      if (worthSending(session)) {
        over.push(toViewInput(session));
      }
    } else {
      still[tabId] = session;
    }
  }
  await writeJson(chrome.storage.session, OPEN_KEY, still);
  await enqueue(over);
  await send(Object.values(still).filter(worthSending).map(toViewInput));
}

async function enqueue(views: WatchViewInput[]): Promise<void> {
  if (!views.length) {
    return;
  }
  const queue = await readJson<WatchViewInput[]>(chrome.storage.local, QUEUE_KEY, []);
  await writeJson(chrome.storage.local, QUEUE_KEY, [...queue, ...views].slice(-MAX_QUEUE));
}

async function send(growing: WatchViewInput[]): Promise<void> {
  const client = await signedInClient().catch(() => null);
  if (!client) {
    await writeJson(chrome.storage.local, CONFIG_KEY, SIGNED_OUT);
    await writeJson(chrome.storage.local, QUEUE_KEY, []);
    return;
  }
  const queue = await readJson<WatchViewInput[]>(chrome.storage.local, QUEUE_KEY, []);
  const batch = [...queue.slice(0, 200 - Math.min(growing.length, 100)), ...growing.slice(0, 100)];
  try {
    const answer = await moviesApi(client.api).recordWatching(batch);
    await writeJson(chrome.storage.local, CONFIG_KEY, {
      track: answer.track,
      ignoredSites: answer.ignoredSites,
    });
    const sent = new Set(batch.map((view) => view.id));
    const now = await readJson<WatchViewInput[]>(chrome.storage.local, QUEUE_KEY, []);
    await writeJson(
      chrome.storage.local,
      QUEUE_KEY,
      now.filter((view) => !sent.has(view.id)),
    );
  } catch {
    // No connection, or a server without Movies yet: the views wait, the last answer stays.
  }
}
