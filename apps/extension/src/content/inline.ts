import {ask, FieldKind} from '../shared/messages';
import {classifyField} from './forms';

/*
 * The key icon in a login field and the menu under it. The icon and the frame of the menu are in
 * a closed shadow root of their own; the menu itself is a page of the extension (inline-menu)
 * in that frame, so the web page can neither read the logins it lists nor press it. This script
 * only places it: what the menu shows and fills is the background's (background/inline.ts).
 */

const MENU_WIDTH = 320;
const ICON_SIZE = 20;
/** The menu's own page tells its height; a frame starts with this. */
const MENU_START_HEIGHT = 120;

const t = (key: string) => chrome.i18n.getMessage(key) || key;

/** The fields menus were asked for, by the id the background knows them by. */
const fields = new Map<string, HTMLInputElement>();
const ids = new WeakMap<HTMLInputElement, string>();

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let icon: HTMLButtonElement | null = null;
let frame: HTMLIFrameElement | null = null;
/** The field the icon (and the menu, when open) belongs to. */
let current: HTMLInputElement | null = null;
let currentKind: FieldKind | null = null;
let placing = 0;

export function setupInline(): void {
  document.addEventListener(
    'focusin',
    event => void onFocus(event.target),
    true,
  );
  document.addEventListener(
    'focusout',
    () => setTimeout(onFocusLeft, 150),
    true,
  );
  document.addEventListener(
    'keydown',
    event => {
      if (event.key === 'Escape' && frame) {
        closeMenu();
      }
    },
    true,
  );
  // Typing into the field: the person does not want a suggestion, and the menu would cover the
  // form's button under the field. A fill of ours sends untrusted events and keeps it.
  document.addEventListener(
    'input',
    event => {
      if (frame && event.isTrusted && event.target === current) {
        closeMenu();
      }
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    event => {
      if (frame && event.target !== host && event.target !== current) {
        closeMenu();
      }
    },
    true,
  );
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  // The menu's page tells how tall it is; nothing else is read from a message.
  window.addEventListener('message', event => {
    if (frame && event.source === frame.contentWindow) {
      const height = Number(
        (event.data as {pdMenuHeight?: unknown} | null)?.pdMenuHeight,
      );
      if (height > 0 && height < 600) {
        frame.style.height = `${Math.ceil(height)}px`;
        // Taller now: placed again, so it does not run past the bottom of the window.
        place();
      }
    }
  });
}

/** One value into a field a menu was opened for (`fill-field`). */
export function fieldById(id: string): HTMLInputElement | null {
  return fields.get(id) ?? null;
}

export function closeMenu(): void {
  frame?.remove();
  frame = null;
}

async function onFocus(target: EventTarget | null): Promise<void> {
  if (!(target instanceof HTMLInputElement) || target === current) {
    return;
  }
  const kind = classifyField(target, document);
  if (!kind) {
    return;
  }
  closeMenu();
  current = target;
  currentKind = kind;
  showIcon();
  await openMenu(false);
}

/** Focus went away from the field, and not into the menu: both go. */
function onFocusLeft(): void {
  const active = document.activeElement;
  if (
    active === current ||
    active === host ||
    (active && host?.contains(active))
  ) {
    return;
  }
  closeMenu();
  icon?.remove();
  icon = null;
  current = null;
  currentKind = null;
}

async function openMenu(explicit: boolean): Promise<void> {
  const field = current;
  const kind = currentKind;
  if (!field || !kind) {
    return;
  }
  const token = await ask<string | null>({
    type: 'menu-open',
    kind,
    fieldId: idOf(field),
    explicit,
  }).catch(() => null);
  if (!token || field !== current) {
    return;
  }
  closeMenu();
  frame = document.createElement('iframe');
  frame.src = `${chrome.runtime.getURL('inline-menu.html')}#${token}`;
  frame.title = t('menuTitle');
  Object.assign(frame.style, {
    position: 'fixed',
    width: `${MENU_WIDTH}px`,
    height: `${MENU_START_HEIGHT}px`,
    border: '0',
    borderRadius: '12px',
    boxShadow: '0 6px 24px rgba(0, 0, 0, .25)',
    colorScheme: 'normal',
    background: 'transparent',
    zIndex: '2147483647',
  });
  shadow().append(frame);
  place();
}

function showIcon(): void {
  if (!icon) {
    icon = document.createElement('button');
    icon.type = 'button';
    icon.title = t('menuTitle');
    icon.setAttribute('aria-label', t('menuTitle'));
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 15q1.3 0 2.1-.9T10 12q0-1.3-.9-2.1T7 9q-1.3 0-2.1.9T4 12q0 1.3.9 2.1T7 15Zm0 3q-2.5 0-4.2-1.8T1 12q0-2.5 1.8-4.2T7 6q2 0 3.4 1.1T12.4 10H23v4h-2v4h-4v-4h-4.6q-.6 1.8-2 2.9T7 18Z"/></svg>';
    Object.assign(icon.style, {
      position: 'fixed',
      width: `${ICON_SIZE}px`,
      height: `${ICON_SIZE}px`,
      padding: '2px',
      border: '0',
      borderRadius: '50%',
      color: '#fff',
      background: '#3f51b5',
      cursor: 'pointer',
      zIndex: '2147483647',
      display: 'grid',
      placeItems: 'center',
    });
    // Not a focus change: the field keeps the focus, the menu toggles.
    icon.addEventListener('pointerdown', event => event.preventDefault());
    icon.addEventListener('click', () =>
      frame ? closeMenu() : void openMenu(true),
    );
    shadow().append(icon);
  }
  place();
}

/** The icon at the right end of the field, the menu under it (above it near the bottom). */
function place(): void {
  cancelAnimationFrame(placing);
  placing = requestAnimationFrame(() => {
    if (!current || !current.isConnected) {
      return;
    }
    const rect = current.getBoundingClientRect();
    if (icon) {
      icon.style.left = `${rect.right - ICON_SIZE - 6}px`;
      icon.style.top = `${rect.top + (rect.height - ICON_SIZE) / 2}px`;
    }
    if (frame) {
      const height = frame.offsetHeight || MENU_START_HEIGHT;
      const below = rect.bottom + 4 + height <= window.innerHeight;
      frame.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 4))}px`;
      frame.style.top = `${below ? rect.bottom + 4 : Math.max(4, rect.top - height - 4)}px`;
    }
  });
}

function shadow(): ShadowRoot {
  if (!host || !root || !host.isConnected) {
    host = document.createElement('pd-vault-inline');
    host.style.all = 'initial';
    root = host.attachShadow({mode: 'closed'});
    document.documentElement.append(host);
  }
  return root;
}

function idOf(field: HTMLInputElement): string {
  let id = ids.get(field);
  if (!id) {
    id = crypto.randomUUID();
    ids.set(field, id);
    fields.set(id, field);
  }
  return id;
}
