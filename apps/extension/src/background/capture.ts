import { OpenVaultItem } from '@pd/contracts';
import { SaveOffer } from '../shared/messages';
import { matchesPage, siteName, siteOf } from '../shared/site';
import { readJson, writeJson } from './storage';
import { DRAFT_SOURCE } from './inline';
import { isUnlocked, itemFields, saveItem, vaultItems, vaultStatus } from './vault';

/*
 * A login typed into a page, offered to be saved. When a form with a password is sent, the
 * content script tells it here; the next page of the tab (or the same one a moment later, for
 * a sign-in without a reload) asks whether there is something to offer, and shows a bar.
 *
 * It waits in session storage (memory only) for PENDING_MS, one per tab. A sign-in in two steps
 * (the login, then the password on the next page) is put together from both.
 */

const PENDING_KEY = 'pending';
/** Sites the user said never to offer for, on disk. */
const NEVER_KEY = 'neverSave';
const PENDING_MS = 5 * 60_000;

interface Pending {
  url: string;
  site: string;
  username: string;
  password: string;
  at: number;
  /** Shown on a page already: a page shows an offer once, the popup until it is answered. */
  shown?: boolean;
}

type PendingByTab = Record<string, Pending>;

export async function noteSubmitted(
  tabId: number,
  url: string,
  username: string,
  password: string,
): Promise<void> {
  const site = siteOf(url);
  if (!site || (await neverSites()).includes(site.site)) {
    return;
  }
  const all = await pendingByTab();
  const before = all[tabId];
  const sameSite = before && before.site === site.site && Date.now() - before.at < PENDING_MS;
  all[tabId] = {
    url: site.origin,
    site: site.site,
    // The second step of a two-step sign-in has no login field: the first step's login.
    username: username || (sameSite ? before.username : ''),
    password,
    at: Date.now(),
  };
  await writeJson(chrome.storage.session, PENDING_KEY, all);
}

/**
 * What to offer in this tab; `null` — nothing (or it is in the vault already). A page (`page`)
 * gets it once: after that it waits in the popup, not on every page that follows.
 */
export async function offerFor(tabId: number, page = false): Promise<SaveOffer | null> {
  const pending = await pendingOf(tabId);
  if (!pending || (page && pending.shown)) {
    return null;
  }
  const status = await vaultStatus().catch(() => 'signed-out' as const);
  if (status === 'none' || status === 'signed-out') {
    return null;
  }
  const offer = { site: siteName(pending.url), username: pending.username };
  if (status === 'locked') {
    if (page) {
      await markShown(tabId);
    }
    return { mode: 'locked', ...offer };
  }
  if (await completeDraft(pending)) {
    await drop(tabId);
    return null;
  }
  const same = await sameLogins(pending);
  if (same.some((item) => item.password === pending.password)) {
    await drop(tabId);
    return null;
  }
  if (page) {
    await markShown(tabId);
  }
  return { mode: same.length ? 'update' : 'save', ...offer };
}

/** Saves what the tab offers: a new login, or the new password of the same login. */
export async function saveOffer(tabId: number, mode: 'save' | 'update'): Promise<void> {
  const pending = await pendingOf(tabId);
  if (!pending || !(await isUnlocked())) {
    return;
  }
  const [existing] = await sameLogins(pending);
  if (mode === 'update' && existing) {
    await saveItem({ ...itemFields(existing), password: pending.password }, existing.id);
  } else {
    await saveItem({
      kind: 'login',
      title: siteName(pending.url),
      urls: [pending.url],
      username: pending.username,
      password: pending.password,
      notes: '',
      favorite: false,
    });
  }
  await drop(tabId);
}

/** "Not now" forgets this one; "never" also stops the offers for the site. */
export async function dismissOffer(tabId: number, never: boolean): Promise<void> {
  const pending = await pendingOf(tabId);
  if (never && pending) {
    const sites = await neverSites();
    await writeJson(chrome.storage.local, NEVER_KEY, [...new Set([...sites, pending.site])]);
  }
  await drop(tabId);
}

/** A closed tab takes its offer with it. */
export async function forgetTab(tabId: number): Promise<void> {
  await drop(tabId);
}

/**
 * A password made in the menu of a sign-up was saved at once (inline.ts); the sent form brings
 * the login that goes with it: the saved item gets it, and nothing more is offered.
 */
async function completeDraft(pending: Pending): Promise<boolean> {
  const { items } = await vaultItems({ use: false });
  const draft = items.find(
    (item) =>
      item.source?.app === DRAFT_SOURCE &&
      item.password === pending.password &&
      matchesPage(item.urls, pending.url),
  );
  if (!draft) {
    return false;
  }
  // Without `source`: a complete login now, like any other.
  const { kind, title, urls, password, notes, favorite } = draft;
  const username = pending.username || draft.username;
  await saveItem({ kind, title, urls, username, password, notes, favorite }, draft.id);
  return true;
}

async function sameLogins(pending: Pending): Promise<OpenVaultItem[]> {
  const { items } = await vaultItems({ use: false });
  return items.filter(
    (item) =>
      item.kind === 'login' &&
      item.username === pending.username &&
      matchesPage(item.urls, pending.url),
  );
}

/** The tab's login with a password, still fresh. */
async function pendingOf(tabId: number): Promise<Pending | null> {
  const pending = (await pendingByTab())[tabId];
  return pending?.password && Date.now() - pending.at < PENDING_MS ? pending : null;
}

async function pendingByTab(): Promise<PendingByTab> {
  return readJson<PendingByTab>(chrome.storage.session, PENDING_KEY, {});
}

async function markShown(tabId: number): Promise<void> {
  const all = await pendingByTab();
  if (all[tabId]) {
    all[tabId].shown = true;
    await writeJson(chrome.storage.session, PENDING_KEY, all);
  }
}

async function drop(tabId: number): Promise<void> {
  const all = await pendingByTab();
  if (tabId in all) {
    delete all[tabId];
    await writeJson(chrome.storage.session, PENDING_KEY, all);
  }
}

/** Offers for the site again. */
export async function forgetNever(site: string): Promise<void> {
  const sites = await neverSites();
  await writeJson(
    chrome.storage.local,
    NEVER_KEY,
    sites.filter((candidate) => candidate !== site),
  );
}

export function neverSites(): Promise<string[]> {
  return readJson<string[]>(chrome.storage.local, NEVER_KEY, []);
}
