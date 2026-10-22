/*
 * What the parts of the extension say to each other. The service worker (background) is the
 * only one that holds the session and the open vault; the popup and the content scripts ask it.
 *
 * Trust: the popup is the extension's own page. A content script runs inside a web page and may
 * be fooled by it, so it can ask only about its own tab — never for a password: passwords go to
 * a page only when the background decides to fill them (see background/fill.ts).
 */

import type {
  AiAttachment,
  AiAttachmentUpload,
  WorkstateInput,
  WritingRewriteMode,
} from '@pd/contracts';
import type { EngagementReport } from './engagement';

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
  /**
   * `locked` — it can be saved once the vault is unlocked; `signed-out` — once the extension is
   * signed in to the dashboard (and the vault unlocked). The bar offers the way to either.
   */
  mode: 'save' | 'update' | 'locked' | 'signed-out';
  site: string;
  username: string;
}

export interface PopupState {
  telemetry: { enabled: boolean; excluded: boolean };
  server: string | null;
  email: string | null;
  vault: VaultStatus | 'signed-out';
  /** The active tab, when it is a web page. */
  page: { url: string; site: string } | null;
  offer: SaveOffer | null;
  /** The check of the writing on the active page; `null` — signed out, or not a web page. */
  writing: WritingPopupState | null;
  /** The product of the active page, for "To the wishlist"; `null` — not a product's page. */
  wish: WishPopupState | null;
  /**
   * The popup was opened to unlock the vault (the shortcut that fills a login): the master
   * password is asked at once, and nowhere else unless a login is wanted.
   */
  unlockAsked: boolean;
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
  | WorkstateRequest
  | { type: 'telemetry-consent'; enabled: boolean }
  | { type: 'telemetry-exclude'; excluded: boolean }
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
  // The assistant beside the page (sidepanel): the conversation shared with the dashboard.
  | { type: 'chat-current' }
  | { type: 'chat-new' }
  | { type: 'chat-send'; content: string; conversationId?: string; attachments?: AiAttachment[] }
  // A file for the next message (a screenshot pasted with Ctrl+V): its bytes in base64, since a
  // message between the parts of the extension carries only JSON.
  | { type: 'chat-attach'; name: string; mimeType: string; base64: string }
  | { type: 'open-assistant' }
  | { type: 'pass-site'; site: string }
  // Writing on the active page: on or off on its site, on or off everywhere.
  | { type: 'writing-site'; on: boolean }
  | { type: 'writing-enabled'; on: boolean }
  // The menu under a field (inline-menu.html, a page of the extension in a frame of the page);
  // `token` is the field it was opened for (see background/inline.ts).
  | { type: 'menu-state'; token: string }
  | { type: 'menu-fill'; token: string; id: string }
  | { type: 'menu-fill-text'; token: string; value: string }
  /** A strong password into the fields for a new one, and into the vault at once. */
  | { type: 'menu-generate'; token: string }
  | { type: 'menu-unlock'; token: string; masterPassword: string }
  | { type: 'menu-open-popup' }
  /** "To the wishlist": the product of the active page goes to Finance → Wishlist. */
  | { type: 'wish-add' };

/** From a content script, about its own tab. */
export type ContentRequest =
  | { type: 'telemetry-engagement'; report: EngagementReport }
  /** The page has a password field: the badge counts the logins for it. */
  | { type: 'login-form' }
  /** A login form was sent; an empty password — the first step of a two-step sign-in. */
  | { type: 'submitted'; username: string; password: string }
  | { type: 'offer' }
  | { type: 'save-offer'; mode: 'save' | 'update' }
  | { type: 'dismiss-offer'; never: boolean }
  /** "Enter the master password" / "Sign in" on the bar: the popup, at that step. */
  | { type: 'offer-open' }
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
  | { type: 'writing-ignore'; word?: string; ruleId?: string }
  /** Fixes taken from the suggestions: only how many, for the achievements. */
  | { type: 'writing-accepted'; count: number }
  /** "Not on this site" from the badge's menu: only the page's own site. */
  | { type: 'writing-off-here' }
  | { type: 'writing-settings' };

/** From the background to a content script. */
export type PageCommand =
  /** `fieldId` — the field a menu was opened for: its form is filled. */
  | { type: 'fill'; username: string; password: string; fieldId?: string }
  /** A new password from the generator: into the fields for a new one. */
  | { type: 'fill-new-password'; password: string }
  /** One value into the field the menu was opened for. */
  | { type: 'fill-field'; fieldId: string; value: string }
  | { type: 'close-menu' }
  /** What the page shows, for the assistant's `browser_current_page`. */
  | { type: 'snapshot'; withText: boolean }
  /** Writing was switched on or off: whether to check is asked again. */
  | { type: 'writing-changed' }
  /** The vault was unlocked: a login waiting to be saved is offered again, now with "Save". */
  | { type: 'offer-again' }
  /** The page's markup, for the product it describes (the wishlist). */
  | { type: 'product' };

/** A page's answer to `snapshot`: the selection, and its readable text when asked. */
export interface PageSnapshot {
  selection: string;
  text: string | null;
}

/** A page's answer to `product`: its markup, cut at `PAGE_HTML_MAX`. */
export interface PageHtml {
  html: string;
}

/** A product page's markup is read up to this length (the description is near its start). */
export const PAGE_HTML_MAX = 3_000_000;

/** The product of the active page as the popup shows it. */
export interface WishPopupState {
  url: string;
  name: string | null;
  price: number | null;
  currency: string | null;
  image: string | null;
  /** In the wishlist already: its id. */
  wishId: string | null;
}

/** Writing as the popup shows it for the active page. */
export interface WritingPopupState {
  /** The server can check (its LanguageTool is set up). */
  available: boolean;
  /** Writing is on in the settings of the dashboard. */
  enabled: boolean;
  /** Not on the list of the sites left alone. */
  onSite: boolean;
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
/** What the server made of a file for the chat, or why it could not read it. */
export type ChatAttachResult =
  | { attachment: AiAttachmentUpload }
  | { failure: 'unsupported' | 'empty' | 'no-vision' | 'too-large' | 'failed' };

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

export type WorkstateRequest =
  | { type: 'workstate-preview'; windowId: number }
  | { type: 'workstate-confirm'; id: string }
  | { type: 'workstate-cancel' }
  | { type: 'workstate-open' };

export interface WorkstatePreview {
  input: WorkstateInput;
  server: string;
  expires: number;
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
