import { ask, ErrorCode, ExtensionError, MenuState } from '../shared/messages';
import { field, h, t } from '../popup/dom';

/*
 * The menu under a login field: a page of the extension in a frame of the web page
 * (content/inline.ts places it). It shows what the background allows for its token — the logins
 * of the frame's own site, a strong password for a sign-up, the user's logins for a sign-up's
 * login field — and asks the background to fill. The page around it cannot read it.
 *
 * It can still be covered or made see-through to steal a click (clickjacking): a press counts
 * only when the browser says the menu has been fully visible for a moment (IntersectionObserver
 * v2, `isVisible`).
 */

const token = location.hash.slice(1);
const app = document.getElementById('app') as HTMLElement;
/** How long the menu must have been in plain sight before a press counts. */
const VISIBLE_BEFORE_PRESS_MS = 400;

let visibleSince: number | null = null;

watchVisibility();
reportHeight();
void render();

async function render(): Promise<void> {
  let state: MenuState;
  try {
    state = await ask<MenuState>({ type: 'menu-state', token });
  } catch (error) {
    show(h('p', { class: 'error', text: errorText(error) }));
    return;
  }
  show(header(state.site), body(state));
}

function body(state: MenuState): HTMLElement {
  switch (state.vault) {
    case 'signed-out':
      return note(t('menuSignedOut'), openExtension());
    case 'none':
      return note(t('menuNoVault'));
    case 'locked':
      return unlockForm();
    case 'unlocked':
      return state.kind === 'new-password'
        ? strongPassword()
        : state.kind === 'signup-username'
          ? suggestionList(state.suggestions)
          : loginList(state);
  }
}

function loginList(state: MenuState): HTMLElement {
  if (!state.logins.length) {
    return note(t('menuNoLogins', state.site), openExtension());
  }
  return h(
    'div',
    { class: 'list' },
    ...state.logins.map((login) =>
      row(login.title, login.username, () => ask({ type: 'menu-fill', token, id: login.id })),
    ),
  );
}

function suggestionList(suggestions: string[]): HTMLElement {
  if (!suggestions.length) {
    return note(t('menuNoSuggestions'));
  }
  return h(
    'div',
    { class: 'list' },
    ...suggestions.map((value) =>
      row(value, '', () => ask({ type: 'menu-fill-text', token, value })),
    ),
  );
}

function strongPassword(): HTMLElement {
  return h(
    'div',
    { class: 'list' },
    row(t('menuStrongPassword'), t('menuStrongPasswordHint'), () =>
      ask({ type: 'menu-generate', token }),
    ),
  );
}

function unlockForm(): HTMLElement {
  const master = h('input', {
    type: 'password',
    autocomplete: 'current-password',
    required: true,
    autofocus: true,
  });
  const error = h('p', { class: 'error' });
  const submit = h('button', { class: 'button filled', type: 'submit', text: t('unlock') });
  return h(
    'form',
    {
      class: 'unlock',
      onSubmit: (event) => {
        event.preventDefault();
        if (!pressCounts()) {
          return;
        }
        submit.disabled = true;
        error.textContent = '';
        void ask({ type: 'menu-unlock', token, masterPassword: master.value })
          .then(() => render())
          .catch((failure: unknown) => {
            error.textContent = errorText(failure);
            master.select();
          })
          .finally(() => (submit.disabled = false));
      },
    },
    field(t('masterPassword'), master),
    error,
    submit,
  );
}

function row(title: string, sub: string, action: () => Promise<unknown>): HTMLElement {
  return h(
    'button',
    {
      class: 'row',
      type: 'button',
      onClick: () => {
        if (pressCounts()) {
          void action().catch((error: unknown) =>
            show(h('p', { class: 'error', text: errorText(error) })),
          );
        }
      },
    },
    h('span', { class: 'title', text: title }),
    sub ? h('span', { class: 'sub', text: sub }) : null,
  );
}

function header(site: string): HTMLElement {
  return h('div', { class: 'header', text: `Personal Dashboard · ${site}` });
}

function note(text: string, action?: HTMLElement): HTMLElement {
  return h('div', { class: 'note' }, h('p', { text }), action);
}

function openExtension(): HTMLElement {
  return h('button', {
    class: 'button text',
    type: 'button',
    text: t('menuOpenExtension'),
    onClick: () => {
      if (pressCounts()) {
        void ask({ type: 'menu-open-popup' });
      }
    },
  });
}

function show(...nodes: HTMLElement[]): void {
  app.replaceChildren(...nodes);
}

function errorText(error: unknown): string {
  const code: ErrorCode = error instanceof ExtensionError ? error.code : 'failed';
  return t(`error_${code.replace(/-/g, '_')}`);
}

/** The menu has been fully visible, uncovered and opaque, long enough. */
function pressCounts(): boolean {
  return visibleSince !== null && Date.now() - visibleSince >= VISIBLE_BEFORE_PRESS_MS;
}

function watchVisibility(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // A browser without v2 tells only that it is in the viewport.
        const visible =
          (entry as IntersectionObserverEntry & { isVisible?: boolean }).isVisible ??
          entry.isIntersecting;
        visibleSince = visible ? (visibleSince ?? Date.now()) : null;
      }
    },
    { threshold: [1], trackVisibility: true, delay: 100 } as IntersectionObserverInit,
  );
  observer.observe(document.body);
}

/** The frame around it is sized by the page: it is told the height of the menu, nothing else. */
function reportHeight(): void {
  const tell = () => parent.postMessage({ pdMenuHeight: document.body.scrollHeight }, '*');
  new ResizeObserver(tell).observe(document.body);
}
