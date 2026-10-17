import { ask, WritingPopupState } from '../shared/messages';
import { h, icon, t } from './dom';
import { offerBanner } from './items.view';
import type { Popup } from './popup';
import { accountBar } from './unlock.view';

/**
 * The first view once signed in: the check of the writing on this page first (as Grammarly's
 * popup), then the vault and the tools. The master password is not asked here — only when a
 * login is wanted: "Logins" below, or the menu under a login field of a page.
 */
export function homeView(popup: Popup): HTMLElement {
  const { state } = popup;
  return h(
    'section',
    { class: 'view home' },
    accountBar(popup),
    state.vault === 'unlocked' && state.offer ? offerBanner(popup, state.offer) : null,
    state.writing && state.page ? writingCard(popup, state.writing, state.page.site) : null,
    vaultCard(popup),
    h(
      'div',
      { class: 'tools' },
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

function writingCard(popup: Popup, writing: WritingPopupState, site: string): HTMLElement {
  const card = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('spellcheck'), h('span', { text: t('writingTitle') })),
  );
  if (!writing.available) {
    card.append(
      h('p', { class: 'hint', text: t('writingNotSetUp') }),
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
      h('p', { class: 'hint', text: t('writingOffEverywhere') }),
      h('button', {
        class: 'button filled small',
        type: 'button',
        text: t('writingTurnOn'),
        onClick: () => void change(popup, { type: 'writing-enabled', on: true }),
      }),
    );
    return card;
  }
  const input = h('input', { type: 'checkbox', attrs: { role: 'switch' } });
  input.checked = writing.onSite;
  input.addEventListener('change', () => {
    input.disabled = true;
    void change(popup, { type: 'writing-site', on: input.checked });
  });
  card.append(
    h('label', { class: 'toggle' }, input, h('span', { text: t('writingOnSite', site) })),
    h('p', {
      class: 'hint',
      text: t(writing.onSite ? 'writingOnSiteHint' : 'writingOffSiteHint'),
    }),
  );
  return card;
}

function vaultCard(popup: Popup): HTMLElement {
  const { vault } = popup.state;
  const card = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('lock'), h('span', { text: t('vaultTitle') })),
  );
  if (vault === 'none') {
    card.append(
      h('p', { class: 'hint', text: t('noVaultHint') }),
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
    h('p', { class: 'hint', text: t(vault === 'unlocked' ? 'vaultOpenHint' : 'vaultLockedHint') }),
    h(
      'div',
      { class: 'actions start' },
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
            onClick: () => void ask({ type: 'lock' }).then(() => popup.reload()),
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
  message: { type: 'writing-site' | 'writing-enabled'; on: boolean },
): Promise<void> {
  try {
    await ask(message);
  } catch (error) {
    popup.toast(popup.errorText(error));
  }
  await popup.reload();
}
