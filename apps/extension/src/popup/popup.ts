import { ask, ErrorCode, ExtensionError, PopupState } from '../shared/messages';
import { h, t } from './dom';
import { generatorView } from './generator.view';
import { itemsView } from './items.view';
import { neverSitesView } from './never-sites.view';
import { signInView } from './sign-in.view';
import { noVaultView, unlockView } from './unlock.view';

/*
 * The popup: one view at a time, chosen by the state the background reports. It keeps nothing
 * itself — the session and the open vault are the background's (see background/background.ts).
 */

export interface Popup {
  state: PopupState;
  /** Asks the background for the state again and shows the view that fits it. */
  reload(): Promise<void>;
  show(view: HTMLElement): void;
  /** A short message at the bottom. */
  toast(text: string): void;
  /** The text for an error the background answered with. */
  errorText(error: unknown): string;
  generator(back: () => void): void;
  neverSites(back: () => void): void;
  openDashboard(path?: string): void;
}

const app = document.getElementById('app') as HTMLElement;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const popup: Popup = {
  state: { server: null, email: null, vault: 'signed-out', page: null, offer: null },

  async reload() {
    try {
      popup.state = await ask<PopupState>({ type: 'state' });
    } catch (error) {
      popup.show(problemView(popup.errorText(error)));
      return;
    }
    popup.show(viewFor(popup.state));
  },

  show(view) {
    app.replaceChildren(view);
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

  openDashboard(path = '') {
    if (popup.state.server) {
      void chrome.tabs.create({ url: `${popup.state.server}${path}` });
      window.close();
    }
  },
};

function viewFor(state: PopupState): HTMLElement {
  switch (state.vault) {
    case 'signed-out':
      return signInView(popup);
    case 'none':
      return noVaultView(popup);
    case 'locked':
      return unlockView(popup);
    case 'unlocked':
      return itemsView(popup);
  }
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
