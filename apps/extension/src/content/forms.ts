import type { FieldKind } from '../shared/messages';

/*
 * Login forms on a page: finding the fields, filling them, reading what was typed. Plain DOM,
 * no knowledge of the extension, so it is tested on forms built in jsdom.
 */

const TEXT_TYPES = new Set(['', 'text', 'email', 'tel']);
/** How a login field tends to be named, in its attributes. */
const LOGIN_HINT = /user|login|e-?mail|mail|phone|account|ident/i;
/** How a sign-up form names its button or itself. */
const SIGNUP_HINT =
  /sign\s?up|register|registration|create (an |your )?account|join now|регистр|зарегистр|создать (аккаунт|учётную|учетную)/i;

export interface LoginFields {
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
}

/** Whether a person can see and type into the field. */
function isUsable(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly || input.type === 'hidden' || input.hidden) {
    return false;
  }
  const style = input.ownerDocument.defaultView?.getComputedStyle(input);
  return (
    style?.display !== 'none' &&
    style?.visibility !== 'hidden' &&
    input.getAttribute('aria-hidden') !== 'true'
  );
}

export function passwordFields(root: ParentNode): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(isUsable);
}

/**
 * The login field for a password field: in its form (or the page, without one), before it —
 * the one named like a login, or the nearest one. Without a password field (the first step of
 * a two-step sign-in), the field named like a login.
 */
export function findLoginFields(root: Document): LoginFields {
  const password = passwordFields(root)[0] ?? null;
  return { username: usernameFor(password, password?.form ?? root), password };
}

/** What a field is for; `null` — nothing the vault helps with (a search, a name, an address). */
export function classifyField(input: HTMLInputElement, root: Document): FieldKind | null {
  if (!isUsable(input)) {
    return null;
  }
  const scope: ParentNode = input.form ?? root;
  if (input.type === 'password') {
    if (input.autocomplete === 'new-password') {
      return 'new-password';
    }
    if (input.autocomplete === 'current-password' || !isSignupForm(scope)) {
      return 'password';
    }
    // A change of password: the current one first, then the new one and its repeat.
    const fields = passwordFields(scope);
    return fields.length >= 3 && fields[0] === input ? 'password' : 'new-password';
  }
  if (!TEXT_TYPES.has(input.type.toLowerCase())) {
    return null;
  }
  if (isSignupForm(scope)) {
    return looksLikeLogin(input) ? 'signup-username' : null;
  }
  const password = passwordFields(scope)[0] ?? null;
  return usernameFor(password, scope) === input ? 'username' : null;
}

/**
 * A form to make an account or a new password: a field for a new password, two password fields
 * (the password and its repeat), or a button that says so.
 */
function isSignupForm(scope: ParentNode): boolean {
  const passwords = passwordFields(scope);
  if (passwords.some((input) => input.autocomplete === 'new-password')) {
    return true;
  }
  if (passwords.length >= 2) {
    return true;
  }
  const words = [
    ...scope.querySelectorAll<HTMLElement>('button, input[type="submit"], [role="button"], h1, h2'),
  ]
    .map((node) => (node instanceof HTMLInputElement ? node.value : (node.textContent ?? '')))
    .join(' ');
  return SIGNUP_HINT.test(words);
}

/** Puts a value into one field, as typing would. */
export function fillField(input: HTMLInputElement, value: string): void {
  setValue(input, value);
}

/** The login typed into the page's form now (for a password made on a sign-up). */
export function typedLogin(root: Document): string {
  return findLoginFields(root).username?.value.trim() ?? '';
}

function usernameFor(
  password: HTMLInputElement | null,
  scope: ParentNode,
): HTMLInputElement | null {
  const texts = [...scope.querySelectorAll<HTMLInputElement>('input')].filter(
    (input) => TEXT_TYPES.has(input.type.toLowerCase()) && isUsable(input),
  );
  const before = password
    ? texts.filter(
        (input) => input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING,
      )
    : texts;
  const named = before.filter(looksLikeLogin);
  return password ? (named.at(-1) ?? before.at(-1) ?? null) : (named[0] ?? null);
}

/** Fills the login form of the page; `false` — there is none. */
export function fillLogin(root: Document, username: string, password: string): boolean {
  const fields = findLoginFields(root);
  if (fields.username && username) {
    setValue(fields.username, username);
  }
  if (fields.password) {
    setValue(fields.password, password);
  }
  return !!fields.password || (!!fields.username && !!username);
}

/**
 * A new password into the fields for one: a sign-up or a change of password, where it is typed
 * twice. The field of the current password is left alone.
 */
export function fillNewPassword(root: Document, password: string): boolean {
  const fields = passwordFields(root).filter(
    (input) => input.autocomplete !== 'current-password' || passwordFields(root).length === 1,
  );
  const targets = fields.length > 2 ? fields.slice(-2) : fields;
  targets.forEach((input) => setValue(input, password));
  return targets.length > 0;
}

/**
 * What was typed into a form being sent: the login and the password. A change of password has
 * the current and the new one: the new one is the last. `null` — not a login form.
 */
export function readSubmitted(
  scope: ParentNode,
  root: Document,
): { username: string; password: string } | null {
  const passwords = passwordFields(scope).filter((input) => input.value);
  const fields = findLoginFields(root);
  const password = passwords.at(-1)?.value ?? '';
  const username = (
    fields.username && scope.contains(fields.username) ? fields.username.value : ''
  ).trim();
  if (!password && !(username && fields.username && looksLikeLogin(fields.username))) {
    return null;
  }
  return { username, password };
}

/**
 * Sets a value as typing would: through the element's own setter (React watches it) and with
 * the events frameworks listen to.
 */
function setValue(input: HTMLInputElement, value: string): void {
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function looksLikeLogin(input: HTMLInputElement): boolean {
  if (input.type === 'email' || /username|email/.test(input.autocomplete)) {
    return true;
  }
  return [input.name, input.id, input.placeholder, input.getAttribute('aria-label') ?? ''].some(
    (text) => LOGIN_HINT.test(text),
  );
}
