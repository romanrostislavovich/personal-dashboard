import {DEFAULT_PASSWORD_OPTIONS, generatePassword} from '@pd/client-core';
import {OpenVaultItem} from '@pd/contracts';
import {
  ExtensionError,
  FieldKind,
  FillAnswer,
  MenuState,
  PageCommand,
} from '../shared/messages';
import {matchesPage, siteName, siteOf} from '../shared/site';
import {email} from './account';
import {readJson, writeJson} from './storage';
import {
  isUnlocked,
  saveItem,
  unlock,
  vaultItem,
  vaultItems,
  vaultStatus,
} from './vault';

/*
 * The menu under a field of a page (content/inline.ts draws it, inline-menu.ts is its page).
 * The menu is a page of the extension in a frame: the web page can neither read what it lists
 * nor press it. A content script asks for a menu for one of its fields and gets a token; the
 * menu shows what the token allows — the logins of the frame's own site — and every fill goes
 * back to that one frame only.
 */

const MENUS_KEY = 'menus';
/** A menu left open longer than this is forgotten. */
const MENU_MS = 30 * 60_000;
const MAX_MENUS = 20;
/** A password made in a sign-up is saved at once, marked so: the sent form completes it. */
export const DRAFT_SOURCE = 'extension-draft';
const MAX_SUGGESTIONS = 6;

interface MenuSession {
  tabId: number;
  frameId: number;
  /** The frame's own address, as the browser says: what the logins are matched against. */
  frameUrl: string;
  kind: FieldKind;
  fieldId: string;
  at: number;
}

/**
 * A menu for a field that got the focus. Opened by itself only when it has something to offer
 * (the site's logins, a sign-up); a click on the key icon (`explicit`) opens it always — with
 * the unlock form when the vault is locked.
 */
export async function openMenu(
  sender: chrome.runtime.MessageSender,
  kind: FieldKind,
  fieldId: string,
  explicit: boolean,
): Promise<string | null> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || !sender.url || !siteOf(sender.url)) {
    return null;
  }
  if (!explicit && !(await worthShowing(kind, sender.url))) {
    return null;
  }
  const token = crypto.randomUUID();
  const sessions = await fresh();
  sessions[token] = {
    tabId,
    frameId: sender.frameId ?? 0,
    frameUrl: sender.url,
    kind,
    fieldId,
    at: Date.now(),
  };
  await writeJson(chrome.storage.session, MENUS_KEY, sessions);
  return token;
}

export async function menuState(token: string): Promise<MenuState> {
  const session = await sessionOf(token);
  const vault = await vaultStatus().catch(() => 'signed-out' as const);
  const unlocked = vault === 'unlocked';
  return {
    vault,
    kind: session.kind,
    site: siteName(session.frameUrl),
    logins:
      unlocked && (session.kind === 'username' || session.kind === 'password')
        ? (await loginsFor(session.frameUrl)).map(item => ({
            id: item.id,
            title: item.title,
            username: item.username,
          }))
        : [],
    suggestions:
      unlocked && session.kind === 'signup-username' ? await suggestions() : [],
  };
}

/** A login of the frame's site into the frame; never one of another site. */
export async function menuFill(token: string, id: string): Promise<void> {
  const session = await sessionOf(token);
  const item = await vaultItem(id);
  if (item.kind !== 'login' || !matchesPage(item.urls, session.frameUrl)) {
    throw new ExtensionError('not-allowed');
  }
  await send(session, {
    type: 'fill',
    username: item.username,
    password: item.password,
    fieldId: session.fieldId,
  });
  await close(token, session);
}

/** A suggested email or login into the field. */
export async function menuFillText(
  token: string,
  value: string,
): Promise<void> {
  const session = await sessionOf(token);
  if (
    session.kind !== 'signup-username' ||
    !(await suggestions()).includes(value)
  ) {
    throw new ExtensionError('not-allowed');
  }
  await send(session, {type: 'fill-field', fieldId: session.fieldId, value});
  await close(token, session);
}

/**
 * A strong password into the fields for a new one, saved to the vault at once with the login
 * typed so far: a form that never gets sent loses nothing. Sending it completes the item
 * (capture.ts, DRAFT_SOURCE).
 */
export async function menuGenerate(token: string): Promise<void> {
  const session = await sessionOf(token);
  if (!(await isUnlocked())) {
    throw new ExtensionError('locked');
  }
  const password = generatePassword(DEFAULT_PASSWORD_OPTIONS);
  const answer = await send(session, {type: 'fill-new-password', password});
  if (!answer?.filled) {
    throw new ExtensionError('failed');
  }
  const site = siteOf(session.frameUrl);
  await saveItem({
    kind: 'login',
    title: siteName(session.frameUrl),
    urls: site ? [site.origin] : [],
    username: answer.login ?? '',
    password,
    notes: '',
    favorite: false,
    source: {app: DRAFT_SOURCE, id: String(Date.now())},
  });
  await close(token, session);
}

export async function menuUnlock(
  token: string,
  masterPassword: string,
): Promise<void> {
  await sessionOf(token);
  await unlock(masterPassword);
}

async function worthShowing(
  kind: FieldKind,
  frameUrl: string,
): Promise<boolean> {
  if (!(await isUnlocked())) {
    return false; // The key icon is there; the unlock form waits for a click on it.
  }
  if (kind === 'new-password') {
    return true;
  }
  if (kind === 'signup-username') {
    return (await suggestions()).length > 0;
  }
  return (await loginsFor(frameUrl)).length > 0;
}

async function loginsFor(frameUrl: string): Promise<OpenVaultItem[]> {
  const {items} = await vaultItems({use: false});
  return items
    .filter(item => item.kind === 'login' && matchesPage(item.urls, frameUrl))
    .sort(
      (a, b) =>
        Number(b.favorite) - Number(a.favorite) ||
        a.title.localeCompare(b.title),
    );
}

/** The emails and logins of the vault and the account's email, the most used first. */
async function suggestions(): Promise<string[]> {
  const {items} = await vaultItems({use: false});
  const count = new Map<string, number>();
  for (const item of items) {
    const login = item.username.trim();
    if (item.kind === 'login' && login) {
      count.set(login, (count.get(login) ?? 0) + 1);
    }
  }
  const account = await email().catch(() => null);
  if (account) {
    count.set(account, (count.get(account) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] || Number(b[0].includes('@')) - Number(a[0].includes('@')),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(([login]) => login);
}

async function send(
  session: MenuSession,
  command: PageCommand,
): Promise<FillAnswer | undefined> {
  return chrome.tabs.sendMessage<PageCommand, FillAnswer | undefined>(
    session.tabId,
    command,
    {
      frameId: session.frameId,
    },
  );
}

async function close(token: string, session: MenuSession): Promise<void> {
  await send(session, {type: 'close-menu'}).catch(() => undefined);
  const sessions = await fresh();
  delete sessions[token];
  await writeJson(chrome.storage.session, MENUS_KEY, sessions);
}

async function sessionOf(token: string): Promise<MenuSession> {
  const session = (await fresh())[token];
  if (!session) {
    throw new ExtensionError('not-allowed');
  }
  return session;
}

/** The menus still open, the newest MAX_MENUS of them. */
async function fresh(): Promise<Record<string, MenuSession>> {
  const all = await readJson<Record<string, MenuSession>>(
    chrome.storage.session,
    MENUS_KEY,
    {},
  );
  return Object.fromEntries(
    Object.entries(all)
      .filter(([, session]) => Date.now() - session.at < MENU_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_MENUS),
  );
}
