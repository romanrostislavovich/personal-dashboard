import { SaveOffer } from '../shared/messages';

/*
 * The bar that offers to save a login typed into the page. It lives in a closed shadow root:
 * the page's styles do not reach it and the page's scripts cannot read or press it.
 */

export interface SaveBarActions {
  save(mode: 'save' | 'update'): void;
  dismiss(never: boolean): void;
}

const t = (key: string, ...substitutions: string[]) => chrome.i18n.getMessage(key, substitutions);

const STYLE = `
  :host { all: initial; }
  .bar {
    position: fixed; top: 16px; right: 16px; z-index: 2147483647; max-width: 360px;
    box-sizing: border-box; padding: 14px 16px; border-radius: 12px;
    font: 14px/1.4 system-ui, sans-serif; color: #1b1b1f; background: #fff;
    box-shadow: 0 4px 24px rgba(0, 0, 0, .25);
  }
  @media (prefers-color-scheme: dark) { .bar { color: #e4e1e6; background: #2b2b30; } }
  .title { font-weight: 600; margin-bottom: 4px; }
  .who { opacity: .75; margin-bottom: 12px; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
  button {
    font: inherit; border: 0; border-radius: 18px; padding: 6px 14px; cursor: pointer;
    color: inherit; background: transparent;
  }
  button.primary { color: #fff; background: #3f51b5; }
  button:hover { filter: brightness(.95); }
`;

let host: HTMLElement | null = null;

export function showSaveBar(offer: SaveOffer, actions: SaveBarActions): void {
  hideSaveBar();
  host = document.createElement('pd-vault-save');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const bar = element('div', 'bar');
  bar.setAttribute('role', 'dialog');
  const titleKey =
    offer.mode === 'update'
      ? 'saveBarUpdate'
      : offer.mode === 'locked'
        ? 'saveBarLocked'
        : 'saveBarSave';
  bar.append(
    element('div', 'title', t(titleKey, offer.site)),
    element('div', 'who', offer.username || t('saveBarNoLogin')),
  );

  const buttons = element('div', 'actions');
  buttons.append(
    button(t('saveBarNever'), '', () => close(() => actions.dismiss(true))),
    button(t('saveBarNotNow'), '', () => close(() => actions.dismiss(false))),
  );
  if (offer.mode !== 'locked') {
    const mode = offer.mode;
    buttons.append(
      button(t(mode === 'update' ? 'saveBarUpdateButton' : 'saveBarSaveButton'), 'primary', () =>
        close(() => actions.save(mode)),
      ),
    );
  }
  bar.append(buttons);
  root.append(style, bar);
  document.documentElement.append(host);
}

export function hideSaveBar(): void {
  host?.remove();
  host = null;
}

function close(then: () => void): void {
  hideSaveBar();
  then();
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', className, text) as HTMLButtonElement;
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
