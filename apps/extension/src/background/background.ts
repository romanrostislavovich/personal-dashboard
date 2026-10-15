import { ApiError, generatePassword, passwordStrength } from '@pd/client-core';
import {
  ContentRequest,
  ERROR_CODES,
  ErrorCode,
  ExtensionError,
  FillResult,
  ItemSummary,
  PopupRequest,
  PopupState,
  Reply,
} from '../shared/messages';
import { matchesPage, siteName } from '../shared/site';
import { completeSignIn, email, serverUrl, signIn, signOut } from './account';
import { clearBadges, countLogins } from './badge';
import {
  dismissOffer,
  forgetNever,
  forgetTab,
  neverSites,
  noteSubmitted,
  offerFor,
  saveOffer,
} from './capture';
import { activeTab, fillLogin, fillNewPassword } from './fill';
import { checkForUpdate, scheduleSelfUpdate, UPDATE_ALARM, updateStatus } from './self-update';
import { LOCK_ALARM, lock, unlock, vaultItem, vaultItems, vaultStatus } from './vault';

/*
 * The service worker: the only part that holds the session and the open vault. The popup and
 * the content scripts ask it through messages (see shared/messages.ts for who may ask what).
 */

// Session storage for the extension's own pages and this worker only — never content scripts.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

chrome.runtime.onMessage.addListener((message, sender, reply: (answer: Reply<unknown>) => void) => {
  route(message, sender).then(
    (value) => reply({ ok: true, value }),
    (error: unknown) => reply({ ok: false, error: errorCode(error) }),
  );
  return true; // The answer comes later.
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM) {
    void lockEverywhere();
  } else if (alarm.name === UPDATE_ALARM) {
    void checkForUpdate();
  }
});

// The extension updates itself from its folder on the disk (see self-update.ts).
chrome.runtime.onInstalled.addListener(() => scheduleSelfUpdate());
chrome.runtime.onStartup.addListener(() => {
  scheduleSelfUpdate();
  void checkForUpdate();
});

// The computer is locked: so is the vault.
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'locked') {
    void lockEverywhere();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId));

chrome.commands.onCommand.addListener((command) => {
  if (command === 'fill-login') {
    void fillFirstLogin();
  }
});

async function route(
  message: PopupRequest | ContentRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  if (sender.id !== chrome.runtime.id) {
    throw new ExtensionError('not-allowed');
  }
  if (isPopup(sender)) {
    return fromPopup(message as PopupRequest);
  }
  const tabId = sender.tab?.id;
  if (tabId === undefined) {
    throw new ExtensionError('not-allowed');
  }
  return fromContent(message as ContentRequest, tabId, sender);
}

/**
 * A page of the extension itself (the popup) — its address is the extension's own origin, which
 * no web page or content script has (none of its pages is open to the web).
 */
function isPopup(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.startsWith(chrome.runtime.getURL('')) === true;
}

async function fromPopup(message: PopupRequest): Promise<unknown> {
  switch (message.type) {
    case 'state':
      return popupState();
    case 'sign-in':
      return signIn(message.server, message.email, message.password);
    case 'sign-in-code':
      return completeSignIn(message.challengeToken, message.code);
    case 'sign-out':
      await lockEverywhere();
      return signOut();
    case 'unlock':
      await unlock(message.masterPassword);
      return refreshBadge();
    case 'lock':
      return lockEverywhere();
    case 'items':
      return itemSummaries();
    case 'secret':
      return (await vaultItem(message.id))[message.field];
    case 'fill':
      return fillInActiveTab((tabId) =>
        vaultItem(message.id).then((item) => fillLogin(tabId, item, message.force)),
      );
    case 'generate': {
      const length = Math.min(64, Math.max(8, Math.round(Number(message.length) || 20)));
      const password = generatePassword({
        length,
        digits: !!message.digits,
        symbols: !!message.symbols,
      });
      return { password, strength: passwordStrength(password).strength };
    }
    case 'fill-generated':
      return fillInActiveTab((tabId) => fillNewPassword(tabId, message.password));
    case 'save-offer':
      return withActiveTab((tabId) => saveOffer(tabId, message.mode));
    case 'dismiss-offer':
      return withActiveTab((tabId) => dismissOffer(tabId, message.never));
    case 'reload':
      chrome.runtime.reload();
      return undefined;
    case 'never-sites':
      return neverSites();
    case 'forget-never':
      return forgetNever(message.site);
  }
}

/** A content script asks only about its own tab; the frame's address is the browser's word. */
async function fromContent(
  message: ContentRequest,
  tabId: number,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'login-form':
      return sender.tab?.url ? countLogins(tabId, sender.tab.url) : undefined;
    case 'submitted':
      return sender.url
        ? noteSubmitted(tabId, sender.url, message.username, message.password)
        : undefined;
    case 'offer':
      return offerFor(tabId, true);
    case 'save-offer':
      return saveOffer(tabId, message.mode);
    case 'dismiss-offer':
      return dismissOffer(tabId, message.never);
  }
}

async function popupState(): Promise<PopupState> {
  const server = await serverUrl();
  const tab = await activeTab();
  const vault = await vaultStatus().catch((error: unknown) => {
    if (errorCode(error) === 'signed-out') {
      return 'signed-out' as const;
    }
    throw error;
  });
  return {
    server,
    email: vault === 'signed-out' ? null : await email(),
    vault,
    page: tab ? { url: tab.url, site: siteName(tab.url) } : null,
    offer: tab && vault !== 'signed-out' ? await offerFor(tab.id) : null,
    update: await updateStatus(),
  };
}

/** Every item for the list, fresh from the server: the logins of the active page first. */
async function itemSummaries(): Promise<{ items: ItemSummary[]; unreadable: number }> {
  const tab = await activeTab();
  const { items, unreadable } = await vaultItems({ fresh: true });
  const summaries = items.map((item): ItemSummary => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    username: item.username,
    site: item.urls[0] ? siteName(item.urls[0]) : '',
    favorite: item.favorite,
    matches: !!tab && item.kind === 'login' && matchesPage(item.urls, tab.url),
  }));
  summaries.sort(
    (a, b) =>
      Number(b.matches) - Number(a.matches) ||
      Number(b.favorite) - Number(a.favorite) ||
      a.title.localeCompare(b.title),
  );
  return { items: summaries, unreadable };
}

async function fillInActiveTab(fill: (tabId: number) => Promise<FillResult>): Promise<FillResult> {
  const tab = await activeTab();
  return tab ? fill(tab.id) : { status: 'no-form' };
}

async function withActiveTab(work: (tabId: number) => Promise<void>): Promise<void> {
  const tab = await activeTab();
  if (tab) {
    await work(tab.id);
  }
}

/** The shortcut: the first login of the page (a favorite first); a locked vault opens the popup. */
async function fillFirstLogin(): Promise<void> {
  const tab = await activeTab();
  if (!tab) {
    return;
  }
  const status = await vaultStatus().catch(() => 'signed-out' as const);
  if (status !== 'unlocked') {
    await chrome.action.openPopup().catch(() => undefined);
    return;
  }
  const { items } = await vaultItems();
  const logins = items
    .filter((item) => item.kind === 'login' && matchesPage(item.urls, tab.url))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  if (logins[0]) {
    await fillLogin(tab.id, logins[0], false);
  }
}

async function refreshBadge(): Promise<void> {
  const tab = await activeTab();
  if (tab) {
    await countLogins(tab.id, tab.url).catch(() => undefined);
  }
}

async function lockEverywhere(): Promise<void> {
  await lock();
  await clearBadges();
}

/** What the popup is told: a known code; no answer from the server is `unreachable`. */
function errorCode(error: unknown): ErrorCode {
  if (error instanceof ExtensionError && ERROR_CODES.includes(error.code)) {
    return error.code;
  }
  if (error instanceof ApiError) {
    return error.status === 401 ? 'signed-out' : 'failed';
  }
  return error instanceof TypeError ? 'unreachable' : 'failed';
}
