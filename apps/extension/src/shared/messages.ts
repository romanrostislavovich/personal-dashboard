/*
 * What the parts of the extension say to each other. The service worker (background) is the
 * only one that holds the session and the open vault; the popup and the content scripts ask it.
 *
 * Trust: the popup is the extension's own page. A content script runs inside a web page and may
 * be fooled by it, so it can ask only about its own tab — never for a password: passwords go to
 * a page only when the background decides to fill them (see background/fill.ts).
 */

import type { WritingRewriteMode } from '@pd/contracts';

/** The vault on the server: not created yet, locked here, or open here. */
export type VaultStatus = 'none' | 'locked' | 'unlocked';

/**
 * What a field of a page is for, for the menu under it (content/forms.ts tells):
 * - `username`, `password` — signing in: the logins of the site;
 * - `new-password` — a sign-up or a change of password: a strong password;
 * - `signup-username` — the login or email of a sign-up: the ones the user tends to use.
 */
export type FieldKind = 'username' | 'password' | 'new-password' | 'signup-username';

/** What the menu under a field shows (inline-menu). */
export interface MenuState {
  vault: VaultStatus | 'signed-out';
  kind: FieldKind;
  /** The site of the frame the field is in. */
  site: string;
  /** For signing in: the logins of the site, without their passwords. */
  logins: { id: string; title: string; username: string }[];
  /** For a sign-up's login: the user's emails and logins, the most used first. */
  suggestions: string[];
}

/** A login as the popup lists it — without its password, which is asked for when needed. */
export interface ItemSummary {
  id: string;
  kind: 'login' | 'note';
  title: string;
  username: string;
  /** The first address, for the line under the title. */
  site: string;
  favorite: boolean;
  /** For the page of the active tab. */
  matches: boolean;
}

/** A login typed into a page and not yet in the vault: offered to be saved. */
export interface SaveOffer {
  /** `locked` — it can be saved once the vault is unlocked in the popup. */
  mode: 'save' | 'update' | 'locked';
  site: string;
  username: string;
}

export interface PopupState {
  server: string | null;
  email: string | null;
  vault: VaultStatus | 'signed-out';
  /** The active tab, when it is a web page. */
  page: { url: string; site: string } | null;
  offer: SaveOffer | null;
  update: {
    /** The server has had a newer version for hours and it has not come (no desktop app here). */
    outdated: boolean;
    /** Newer files are on the disk already: a reload runs them. */
    waitingReload: boolean;
  };
}

export interface Generated {
  password: string;
  strength: 'weak' | 'fair' | 'strong';
}

export type SignInResult =
  { status: 'signed-in' } | { status: 'code-required'; challengeToken: string };

export type FillResult =
  | { status: 'filled' }
  | { status: 'no-form' }
  /** The login is for another site: filled only when the user confirms (`force`). */
  | { status: 'other-site'; site: string };

/** From the popup. */
export type PopupRequest =
  | { type: 'state' }
  | { type: 'sign-in'; server: string; email: string; password: string }
  | { type: 'sign-in-code'; challengeToken: string; code: string }
  | { type: 'sign-out' }
  | { type: 'unlock'; masterPassword: string }
  | { type: 'lock' }
  | { type: 'items' }
  | { type: 'secret'; id: string; field: 'username' | 'password' | 'notes' }
  | { type: 'fill'; id: string; force: boolean }
  /** A new password (made in the background: the popup stays small without the client core). */
  | { type: 'generate'; length: number; digits: boolean; symbols: boolean }
  | { type: 'fill-generated'; password: string }
  | { type: 'save-offer'; mode: 'save' | 'update' }
  | { type: 'dismiss-offer'; never: boolean }
  /** Sites where saving is never offered, and taking one off the list. */
  | { type: 'never-sites' }
  | { type: 'forget-never'; site: string }
  /** Runs the newer files on the disk now (it happens by itself when the popup is closed). */
  | { type: 'reload' }
  // The page shown instead of a closed site (blocked.html): why it is closed, and "open anyway".
  | { type: 'blocked-info'; back: string }
  // The assistant and Claude (popup → "Assistant"): what this browser offers, the tokens of MCP.
  | { type: 'assistant-state' }
  | {
      type: 'assistant-settings';
      update: Partial<{
        currentPage: boolean;
        pageText: boolean;
        openTabs: boolean;
        openUrl: boolean;
      }>;
    }
  | { type: 'mcp-info' }
  | { type: 'mcp-create'; name: string; scope: 'read' | 'write' }
  | { type: 'mcp-revoke'; id: string }
  | { type: 'pass-site'; site: string }
  // The menu under a field (inline-menu.html, a page of the extension in a frame of the page);
  // `token` is the field it was opened for (see background/inline.ts).
  | { type: 'menu-state'; token: string }
  | { type: 'menu-fill'; token: string; id: string }
  | { type: 'menu-fill-text'; token: string; value: string }
  /** A strong password into the fields for a new one, and into the vault at once. */
  | { type: 'menu-generate'; token: string }
  | { type: 'menu-unlock'; token: string; masterPassword: string }
  | { type: 'menu-open-popup' };

/** From a content script, about its own tab. */
export type ContentRequest =
  /** The page has a password field: the badge counts the logins for it. */
  | { type: 'login-form' }
  /** A login form was sent; an empty password — the first step of a two-step sign-in. */
  | { type: 'submitted'; username: string; password: string }
  | { type: 'offer' }
  | { type: 'save-offer'; mode: 'save' | 'update' }
  | { type: 'dismiss-offer'; never: boolean }
  /**
   * A field the vault helps with got the focus (`explicit` — its key icon was clicked): the
   * token of a menu for it, or `null` when nothing is worth showing.
   */
  | { type: 'menu-open'; kind: FieldKind; fieldId: string; explicit: boolean }
  // Writing (content/writing): whether to check on this page, a check, a rewrite, a word or a
  // rule to leave alone — always about the text the person is typing in a field of the page.
  | { type: 'writing-state' }
  | { type: 'writing-check'; text: string }
  | { type: 'writing-rewrite'; text: string; mode: WritingRewriteMode }
  | { type: 'writing-ignore'; word?: string; ruleId?: string };

/** From the background to a content script. */
export type PageCommand =
  | { type: 'fill'; username: string; password: string }
  /** A new password from the generator: into the fields for a new one. */
  | { type: 'fill-new-password'; password: string }
  /** One value into the field the menu was opened for. */
  | { type: 'fill-field'; fieldId: string; value: string }
  | { type: 'close-menu' }
  /** What the page shows, for the assistant's `browser_current_page`. */
  | { type: 'snapshot'; withText: boolean };

/** A page's answer to `snapshot`: the selection, and its readable text when asked. */
export interface PageSnapshot {
  selection: string;
  text: string | null;
}

/** Whether the fields of a page are checked, and what the server can do. */
export interface WritingState {
  check: boolean;
  rewrite: boolean;
}

/** A content script's answer to a fill; `login` — what the form's login field holds now. */
export interface FillAnswer {
  filled: boolean;
  login?: string;
}

/** Every answer of the background: a value, or a code of what went wrong (see ERROR_CODES). */
export type Reply<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

export const ERROR_CODES = [
  'signed-out',
  'unreachable',
  'not-dashboard',
  'insecure-server',
  'wrong-password',
  'wrong-code',
  'wrong-master',
  'no-vault',
  'locked',
  'not-allowed',
  'failed',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** An error the background throws on purpose, with the code the popup shows. */
export class ExtensionError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

/** Asks the background; throws ExtensionError with its code when it refuses. */
export async function ask<T>(message: PopupRequest | ContentRequest): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as Reply<T> | undefined;
  if (!reply) {
    throw new ExtensionError('failed');
  }
  if (!reply.ok) {
    throw new ExtensionError(reply.error);
  }
  return reply.value;
}
