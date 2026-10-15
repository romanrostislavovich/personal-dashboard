/*
 * What the parts of the extension say to each other. The service worker (background) is the
 * only one that holds the session and the open vault; the popup and the content scripts ask it.
 *
 * Trust: the popup is the extension's own page. A content script runs inside a web page and may
 * be fooled by it, so it can ask only about its own tab — never for a password: passwords go to
 * a page only when the background decides to fill them (see background/fill.ts).
 */

/** The vault on the server: not created yet, locked here, or open here. */
export type VaultStatus = 'none' | 'locked' | 'unlocked';

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
  /** Runs the newer files on the disk now (it happens by itself when the popup is closed). */
  | { type: 'reload' }
  | { type: 'forget-never'; site: string };

/** From a content script, about its own tab. */
export type ContentRequest =
  /** The page has a password field: the badge counts the logins for it. */
  | { type: 'login-form' }
  /** A login form was sent; an empty password — the first step of a two-step sign-in. */
  | { type: 'submitted'; username: string; password: string }
  | { type: 'offer' }
  | { type: 'save-offer'; mode: 'save' | 'update' }
  | { type: 'dismiss-offer'; never: boolean };

/** From the background to a content script. */
export type PageCommand =
  | { type: 'fill'; username: string; password: string }
  /** A new password from the generator: into the fields for a new one. */
  | { type: 'fill-new-password'; password: string };

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
