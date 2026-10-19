import { ask, ErrorCode, ExtensionError, PopupState } from '../shared/messages';
import { h, t } from './dom';
import { assistantView } from './assistant.view';
import { generatorView } from './generator.view';
import { homeView } from './home.view';
import { itemsView } from './items.view';
import { neverSitesView } from './never-sites.view';
import { signInView } from './sign-in.view';
import { unlockView } from './unlock.view';

/*
 * The popup: one view at a time, chosen by the state the background reports. It keeps nothing
 * itself — the session and the open vault are the background's (see background/background.ts).
 *
 * It opens on the home view (the writing on this page, the vault, the tools); the master
 * password is asked only when the logins are wanted (`vault()`), or when the shortcut that
 * fills a login opened the popup.
 */

export interface Popup {
  state: PopupState;
  /** Asks the background for the state again and shows the view that fits it. */
  reload(): Promise<void>;
  /** Back to the home view (the state asked again). */
  home(): void;
  /** The logins: the unlock form first when the vault is locked. */
  vault(): void;
  show(view: HTMLElement): void;
  /** A short message at the bottom. */
  toast(text: string): void;
  /** The text for an error the background answered with. */
  errorText(error: unknown): string;
  generator(back: () => void): void;
  neverSites(back: () => void): void;
  /** The assistant and Claude: this browser's tools, the access tokens of MCP. */
  assistant(back: () => void): void;
  openDashboard(path?: string): void;
}

const app = document.getElementById('app') as HTMLElement;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
/** Where the user is: the home view, or the vault (and its unlock form). */
let place: 'home' | 'vault' = 'home';

const popup: Popup = {
  state: {
    server: null,
    email: null,
    vault: 'signed-out',
    page: null,
    offer: null,
    writing: null,
    wish: null,
    unlockAsked: false,
    update: { outdated: false, waitingReload: false },
  },

  async reload() {
    try {
      popup.state = await ask<PopupState>({ type: 'state' });
    } catch (error) {
      popup.show(problemView(popup.errorText(error)));
      return;
    }
    if (popup.state.unlockAsked) {
      place = 'vault';
    }
    popup.show(viewFor(popup.state));
  },

  home() {
    place = 'home';
    void popup.reload();
  },

  vault() {
    place = 'vault';
    popup.show(viewFor(popup.state));
  },

  show(view) {
    app.replaceChildren(
      ...[updateBanner(popup.state), view].filter((node): node is HTMLElement => !!node),
    );
  },

  toast(text) {
    document.querySelector('.toast')?.remove();
    const toast = h('div', { class: 'toast', text, attrs: { role: 'status' } });
    document.body.append(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 2500);
  },

  errorText(error) {
    const code: ErrorCode = error instanceof ExtensionError ? error.code : 'failed';
    return t(`error_${code.replace(/-/g, '_')}`);
  },

  generator(back) {
    popup.show(generatorView(popup, back));
  },

  neverSites(back) {
    void neverSitesView(popup, back).then((view) => popup.show(view));
  },

  assistant(back) {
    void assistantView(popup, back)
      .then((view) => popup.show(view))
      .catch((error: unknown) => popup.show(problemView(popup.errorText(error))));
  },

  openDashboard(path = '') {
    if (popup.state.server) {
      void chrome.tabs.create({ url: `${popup.state.server}${path}` });
      window.close();
    }
  },
};

function viewFor(state: PopupState): HTMLElement {
  if (state.vault === 'signed-out') {
    return signInView(popup);
  }
  if (place === 'vault' && state.vault === 'locked') {
    return unlockView(popup);
  }
  if (place === 'vault' && state.vault === 'unlocked') {
    return itemsView(popup);
  }
  return homeView(popup);
}

/** A newer version: on the disk already (reload), or on the server only (download it). */
function updateBanner(state: PopupState): HTMLElement | null {
  if (state.update.waitingReload) {
    return h(
      'div',
      { class: 'update' },
      h('span', { text: t('updateReady') }),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('updateReload'),
        onClick: () => void ask({ type: 'reload' }),
      }),
    );
  }
  if (state.update.outdated) {
    return h(
      'div',
      { class: 'update' },
      h('span', { text: t('updateOutdated') }),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('updateHow'),
        onClick: () => popup.openDashboard('/settings?tab=apps'),
      }),
    );
  }
  return null;
}

/** The server cannot be reached (or answered with an error): say so, and let it be tried again. */
function problemView(text: string): HTMLElement {
  return h(
    'section',
    { class: 'view center' },
    h('p', { class: 'error', text }),
    h('button', {
      class: 'button tonal',
      type: 'button',
      text: t('retry'),
      onClick: () => void popup.reload(),
    }),
  );
}

document.documentElement.lang = chrome.i18n.getUILanguage();
void popup.reload();
