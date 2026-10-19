import { ApiError, generatePassword, passwordStrength } from '@pd/client-core';
import { WRITING_CHECK_MAX, WRITING_REWRITE_MAX } from '@pd/contracts';
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
  offerAgain,
  offerFor,
  saveOffer,
} from './capture';
import { activeTab, fillLogin, fillNewPassword } from './fill';
import { menuFill, menuFillText, menuGenerate, menuState, menuUnlock, openMenu } from './inline';
import { checkForUpdate, scheduleSelfUpdate, UPDATE_ALARM, updateStatus } from './self-update';
import {
  blockOf,
  guardNavigation,
  noteFront,
  passSite,
  scheduleSites,
  SITES_ALARM,
  sitesTick,
} from './sites';
import {
  checkWriting,
  ignoreInWriting,
  rewriteWriting,
  setWritingEnabled,
  setWritingOnSite,
  writingPopupState,
  writingState,
} from './writing';
import {
  deviceActive,
  deviceOnline,
  deviceSettings,
  saveDeviceSettings,
  startDevice,
  stopDevice,
} from './device';
import { accessTokensApi, aiApi } from '@pd/client-core';
import { signedInClient } from './account';
import { LOCK_ALARM, lock, unlock, vaultItem, vaultItems, vaultStatus } from './vault';
import { addWish, wishPopupState } from './wishlist';
import { chatAttach } from './chat';

/*
 * The service worker: the only part that holds the session and the open vault. The popup and
 * the content scripts ask it through messages (see shared/messages.ts for who may ask what).
 */

// Session storage for the extension's own pages and this worker only — never content scripts.
void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

// The browser as a device of the dashboard: its tools for the assistant while it is online.
// Started whenever the worker starts; the link's own pings keep the worker awake.
void startDevice();

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
  } else if (alarm.name === SITES_ALARM) {
    void sitesTick();
  }
});

// The extension updates itself from its folder on the disk (see self-update.ts).
chrome.runtime.onInstalled.addListener(() => {
  scheduleSelfUpdate();
  scheduleSites();
});
chrome.runtime.onStartup.addListener(() => {
  scheduleSelfUpdate();
  scheduleSites();
  void checkForUpdate();
});

// The computer is locked: so is the vault. Away or back: the time on a site stops or goes on.
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'locked') {
    void lockEverywhere();
  }
  void noteFront();
});

// What is in front changed: the visit of a site ends or starts (see sites.ts).
chrome.tabs.onActivated.addListener(() => {
  void noteFront();
  deviceActive();
});
chrome.windows.onFocusChanged.addListener(() => {
  void noteFront();
  deviceActive();
});
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url !== undefined || change.audible !== undefined) {
    void noteFront();
  }
});

// A page of a site kept closed (a focus session, a spent limit): the extension's page instead.
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    void guardNavigation(details.tabId, details.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId));

chrome.commands.onCommand.addListener((command) => {
  if (command === 'fill-login') {
    void fillFirstLogin();
  } else if (command === 'open-assistant') {
    void openAssistant();
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
  const menu = fromMenu(message);
  if (menu) {
    return menu;
  }
  switch (message.type) {
    case 'state':
      return popupState();
    case 'sign-in':
      return signIn(message.server, message.email, message.password).then(async (result) => {
        await startDevice();
        return result;
      });
    case 'sign-in-code':
      await completeSignIn(message.challengeToken, message.code);
      return startDevice();
    case 'sign-out':
      await lockEverywhere();
      stopDevice();
      return signOut();
    case 'unlock':
      await unlock(message.masterPassword);
      return unlocked();
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
    case 'assistant-state':
      await startDevice();
      return { online: deviceOnline(), settings: await deviceSettings() };
    case 'assistant-settings':
      return saveDeviceSettings(message.update);
    case 'mcp-info':
      return accessTokensApi((await signedInClient()).api).info();
    case 'mcp-create':
      return accessTokensApi((await signedInClient()).api).create({
        name: String(message.name).slice(0, 60),
        scope: message.scope === 'write' ? 'write' : 'read',
      });
    case 'chat-current':
      return aiApi((await signedInClient()).api).currentConversation();
    case 'chat-new':
      return aiApi((await signedInClient()).api).startConversation();
    case 'chat-send':
      return aiApi((await signedInClient()).api).chat({
        content: String(message.content).slice(0, 20_000),
        ...(message.conversationId ? { conversationId: String(message.conversationId) } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      });
    case 'chat-attach':
      return chatAttach(message);
    case 'mcp-revoke':
      return accessTokensApi((await signedInClient()).api).revoke(String(message.id));
    case 'blocked-info':
      return (await blockOf(message.back))?.block ?? null;
    case 'pass-site':
      return passSite(message.site);
    case 'writing-site':
      return setWritingOnSite((await activeTab())?.url, !!message.on);
    case 'writing-enabled':
      return setWritingEnabled(!!message.on);
  }
}

/** The menu under a field (inline-menu); `null` — not one of its messages. */
function fromMenu(message: PopupRequest): Promise<unknown> | null {
  switch (message.type) {
    case 'menu-state':
      return menuState(message.token);
    case 'menu-fill':
      return menuFill(message.token, message.id);
    case 'menu-fill-text':
      return menuFillText(message.token, message.value);
    case 'menu-generate':
      return menuGenerate(message.token);
    case 'menu-unlock':
      return menuUnlock(message.token, message.masterPassword).then(unlocked);
    case 'wish-add':
      return addWish();
    case 'menu-open-popup':
      return openPopupWindow();
    default:
      return null;
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
    case 'offer-open':
      return openForOffer();
    case 'menu-open':
      return openMenu(sender, message.kind, message.fieldId, message.explicit);
    // The frame's own address decides, never what the page says it is.
    case 'writing-state':
      return writingState(sender.url);
    case 'writing-check':
      return checkWriting(sender.url, String(message.text).slice(0, WRITING_CHECK_MAX));
    case 'writing-rewrite':
      return rewriteWriting(
        sender.url,
        String(message.text).slice(0, WRITING_REWRITE_MAX),
        message.mode,
      );
    case 'writing-ignore':
      return ignoreInWriting(message.word, message.ruleId);
    case 'writing-off-here':
      return setWritingOnSite(sender.url, false);
    case 'writing-settings': {
      const server = await serverUrl();
      return server
        ? chrome.tabs.create({ url: `${server}/writing` }).then(() => undefined)
        : undefined;
    }
  }
}

/**
 * The popup, from the menu of a field: the toolbar's popup when the browser lets it open, a
 * small window of it otherwise (no click to open it on has reached here).
 */
async function openPopupWindow(): Promise<void> {
  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 400,
      height: 600,
    });
  }
}

/**
 * The bar's way on: the popup with the master password asked at once (or the sign-in, when
 * the extension is signed out). The password is never typed into the page itself.
 */
async function openForOffer(): Promise<void> {
  // Signed out, it waits through the sign-in: the vault is asked for once that is done.
  await chrome.storage.session.set({ [UNLOCK_ASKED]: true });
  await openPopupWindow();
}

/** Unlocked: the badge counts the logins again, and a login waiting to be saved is offered. */
async function unlocked(): Promise<void> {
  await refreshBadge();
  for (const tabId of await offerAgain()) {
    await chrome.tabs.sendMessage(tabId, { type: 'offer-again' }).catch(() => undefined);
  }
}

/** The assistant beside the page of the window in front (a shortcut, the popup's button). */
async function openAssistant(): Promise<void> {
  const window = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (window?.id !== undefined) {
    await chrome.sidePanel.open({ windowId: window.id });
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
  const signedIn = vault !== 'signed-out';
  return {
    server,
    email: signedIn ? await email() : null,
    vault,
    page: tab ? { url: tab.url, site: siteName(tab.url) } : null,
    offer: tab && signedIn ? await offerFor(tab.id) : null,
    writing: tab && signedIn ? await writingPopupState(tab.url).catch(() => null) : null,
    wish: tab && signedIn ? await wishPopupState().catch(() => null) : null,
    unlockAsked: vault === 'locked' ? await takeUnlockAsked() : false,
    update: await updateStatus(),
  };
}

/** Set by the shortcut before it opens the popup; read once. */
const UNLOCK_ASKED = 'unlockAsked';

async function takeUnlockAsked(): Promise<boolean> {
  const { [UNLOCK_ASKED]: asked } = await chrome.storage.session.get(UNLOCK_ASKED);
  if (asked) {
    await chrome.storage.session.remove(UNLOCK_ASKED);
  }
  return asked === true;
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
    if (status === 'locked') {
      await chrome.storage.session.set({ [UNLOCK_ASKED]: true });
    }
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
