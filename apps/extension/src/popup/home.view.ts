import {ask, WishPopupState, WritingPopupState} from '../shared/messages';
import {h, icon, t} from './dom';
import {offerBanner} from './items.view';
import type {Popup} from './popup';
import {accountBar} from './unlock.view';

/**
 * The first view once signed in: the check of the writing on this page first (as Grammarly's
 * popup), then the vault and the tools. The master password is not asked here — only when a
 * login is wanted: "Logins" below, or the menu under a login field of a page.
 */
export function homeView(popup: Popup): HTMLElement {
  const {state} = popup;
  return h(
    'section',
    {class: 'view home'},
    accountBar(popup),
    state.vault === 'unlocked' && state.offer
      ? offerBanner(popup, state.offer)
      : null,
    state.wish ? wishCard(popup, state.wish) : null,
    state.writing && state.page
      ? writingCard(popup, state.writing, state.page.site)
      : null,
    telemetryCard(popup),
    vaultCard(popup),
    h(
      'div',
      {class: 'tools'},
      h('button', {
        class: 'button tonal small',
        type: 'button',
        text: t('generator'),
        onClick: () => popup.generator(() => popup.home()),
      }),
      h('button', {
        class: 'button tonal small',
        type: 'button',
        text: t('openDashboard'),
        onClick: () => popup.openDashboard(),
      }),
    ),
  );
}

/**
 * The product of the page in front: "To the wishlist" in one click, or "In the wishlist" with
 * a link to it. Finance then watches the price.
 */
function wishCard(popup: Popup, wish: WishPopupState): HTMLElement {
  const price =
    wish.price === null
      ? ''
      : new Intl.NumberFormat(chrome.i18n.getUILanguage(), {
          style: wish.currency ? 'currency' : 'decimal',
          currency: wish.currency ?? undefined,
        }).format(wish.price);
  const card = h(
    'div',
    {class: 'card'},
    h(
      'div',
      {class: 'card-title'},
      icon('favorite'),
      h('span', {text: t('wishTitle')}),
    ),
    h(
      'div',
      {class: 'wish'},
      wish.image ? picture(wish.image) : null,
      h(
        'div',
        {class: 'wish-text'},
        h('span', {class: 'wish-name', text: wish.name ?? wish.url}),
        price ? h('span', {class: 'wish-price', text: price}) : null,
      ),
    ),
  );
  const open = h('button', {
    class: 'button text small',
    type: 'button',
    text: t('wishOpen'),
    onClick: () => popup.openDashboard('/finance?tab=wishlist'),
  });
  if (wish.wishId) {
    card.append(h('p', {class: 'hint', text: t('wishAlready')}), open);
    return card;
  }
  const add = h('button', {
    class: 'button filled small',
    type: 'button',
    text: t('wishAdd'),
    onClick: () => {
      add.disabled = true;
      void ask({type: 'wish-add'})
        .then(() => {
          popup.toast(t('wishAdded'));
          return popup.reload();
        })
        .catch((error: unknown) => {
          add.disabled = false;
          popup.toast(popup.errorText(error));
        });
    },
  });
  card.append(
    h('p', {class: 'hint', text: t('wishHint')}),
    h('div', {class: 'actions start'}, add, open),
  );
  return card;
}

/** The product's picture; one the shop does not give out is left out, not shown broken. */
function picture(src: string): HTMLImageElement {
  const img = h('img', {attrs: {src, alt: ''}});
  img.addEventListener('error', () => img.remove());
  return img;
}

function writingCard(
  popup: Popup,
  writing: WritingPopupState,
  site: string,
): HTMLElement {
  const card = h(
    'div',
    {class: 'card'},
    h(
      'div',
      {class: 'card-title'},
      icon('spellcheck'),
      h('span', {text: t('writingTitle')}),
    ),
  );
  if (!writing.available) {
    card.append(
      h('p', {class: 'hint', text: t('writingNotSetUp')}),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('openDashboard'),
        onClick: () => popup.openDashboard('/settings?tab=integrations'),
      }),
    );
    return card;
  }
  if (!writing.enabled) {
    card.append(
      h('p', {class: 'hint', text: t('writingOffEverywhere')}),
      h('button', {
        class: 'button filled small',
        type: 'button',
        text: t('writingTurnOn'),
        onClick: () => void change(popup, {type: 'writing-enabled', on: true}),
      }),
    );
    return card;
  }
  const input = h('input', {type: 'checkbox', attrs: {role: 'switch'}});
  input.checked = writing.onSite;
  input.addEventListener('change', () => {
    input.disabled = true;
    void change(popup, {type: 'writing-site', on: input.checked});
  });
  card.append(
    h(
      'label',
      {class: 'toggle'},
      input,
      h('span', {text: t('writingOnSite', site)}),
    ),
    h('p', {
      class: 'hint',
      text: t(writing.onSite ? 'writingOnSiteHint' : 'writingOffSiteHint'),
    }),
  );
  return card;
}

function vaultCard(popup: Popup): HTMLElement {
  const {vault} = popup.state;
  const card = h(
    'div',
    {class: 'card'},
    h(
      'div',
      {class: 'card-title'},
      icon('lock'),
      h('span', {text: t('vaultTitle')}),
    ),
  );
  if (vault === 'none') {
    card.append(
      h('p', {class: 'hint', text: t('noVaultHint')}),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('openDashboard'),
        onClick: () => popup.openDashboard('/vault'),
      }),
    );
    return card;
  }
  card.append(
    h('p', {
      class: 'hint',
      text: t(vault === 'unlocked' ? 'vaultOpenHint' : 'vaultLockedHint'),
    }),
    h(
      'div',
      {class: 'actions start'},
      h('button', {
        class: 'button filled small',
        type: 'button',
        text: t('vaultLogins'),
        onClick: () => popup.vault(),
      }),
      vault === 'unlocked'
        ? h('button', {
            class: 'button text small',
            type: 'button',
            text: t('lock'),
            onClick: () => void ask({type: 'lock'}).then(() => popup.reload()),
          })
        : null,
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('neverSites'),
        onClick: () => popup.neverSites(() => popup.home()),
      }),
    ),
  );
  return card;
}

async function change(
  popup: Popup,
  message:
    | {type: 'writing-site' | 'writing-enabled'; on: boolean}
    | {type: 'telemetry-consent'; enabled: boolean}
    | {type: 'telemetry-exclude'; excluded: boolean},
): Promise<void> {
  try {
    await ask(message);
  } catch (error) {
    popup.toast(popup.errorText(error));
  }
  await popup.reload();
}

function telemetryCard(popup: Popup): HTMLElement {
  const input = h('input', {type: 'checkbox', attrs: {role: 'switch'}});
  input.checked = popup.state.telemetry.enabled;
  input.addEventListener('change', () => {
    input.disabled = true;
    void change(popup, {type: 'telemetry-consent', enabled: input.checked});
  });
  const card = h(
    'div',
    {class: 'card'},
    h(
      'label',
      {class: 'toggle'},
      input,
      h('span', {text: t('telemetryConsent')}),
    ),
    h('p', {class: 'hint', text: t('telemetryHint')}),
  );
  if (popup.state.page) {
    const exclude = h('input', {type: 'checkbox'});
    exclude.checked = popup.state.telemetry.excluded;
    exclude.addEventListener('change', () => {
      exclude.disabled = true;
      void change(popup, {
        type: 'telemetry-exclude',
        excluded: exclude.checked,
      });
    });
    card.append(
      h(
        'label',
        {class: 'toggle'},
        exclude,
        h('span', {text: t('telemetryExclude')}),
      ),
    );
  }
  return card;
}
