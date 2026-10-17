import { ask, FillResult, ItemSummary, SaveOffer } from '../shared/messages';
import { h, iconButton, t } from './dom';
import type { Popup } from './popup';

/**
 * The open vault: the logins of the page first, a search over all of them, and for each one
 * "fill", "copy the login", "copy the password". A login typed into the page waits on top.
 */
export function itemsView(popup: Popup): HTMLElement {
  const search = h('input', {
    type: 'search',
    placeholder: t('search'),
    autofocus: true,
    attrs: { 'aria-label': t('search') },
  });
  const list = h('div', { class: 'list' });
  const view = h(
    'section',
    { class: 'view items' },
    h(
      'div',
      { class: 'toolbar' },
      iconButton('back', t('back'), () => popup.home()),
      search,
      iconButton('key', t('generator'), () => popup.generator(() => popup.vault())),
      iconButton('open', t('openDashboard'), () => popup.openDashboard('/vault')),
      iconButton('lock', t('lock'), () => void ask({ type: 'lock' }).then(() => popup.home())),
    ),
    popup.state.offer ? offerBanner(popup, popup.state.offer) : null,
    list,
    h(
      'footer',
      {},
      h('span', { class: 'who', text: popup.state.email ?? '' }),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('neverSites'),
        onClick: () => popup.neverSites(() => popup.vault()),
      }),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('assistant'),
        onClick: () => popup.assistant(() => popup.vault()),
      }),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('signOut'),
        onClick: () => void ask({ type: 'sign-out' }).finally(() => void popup.reload()),
      }),
    ),
  );

  let all: ItemSummary[] = [];
  const draw = () => drawList(popup, list, filter(all, search.value));
  search.addEventListener('input', draw);
  list.append(h('p', { class: 'hint', text: t('loading') }));
  ask<{ items: ItemSummary[]; unreadable: number }>({ type: 'items' }).then(
    ({ items, unreadable }) => {
      all = items;
      draw();
      if (unreadable) {
        popup.toast(t('unreadable', String(unreadable)));
      }
    },
    (error: unknown) =>
      list.replaceChildren(h('p', { class: 'error', text: popup.errorText(error) })),
  );
  return view;
}

function filter(items: ItemSummary[], query: string): ItemSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = `${item.title} ${item.username} ${item.site}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

function drawList(popup: Popup, list: HTMLElement, items: ItemSummary[]): void {
  const forPage = items.filter((item) => item.matches);
  const rest = items.filter((item) => !item.matches);
  list.replaceChildren(
    ...(forPage.length
      ? [
          h('h2', { text: t('forThisSite', popup.state.page?.site ?? '') }),
          ...forPage.map((item) => row(popup, item)),
        ]
      : []),
    ...(rest.length && forPage.length ? [h('h2', { text: t('allItems') })] : []),
    ...rest.map((item) => row(popup, item)),
    ...(items.length ? [] : [h('p', { class: 'hint', text: t('nothingFound') })]),
  );
}

function row(popup: Popup, item: ItemSummary): HTMLElement {
  const copy = (field: 'username' | 'password' | 'notes', done: string) =>
    ask<string>({ type: 'secret', id: item.id, field })
      .then((value) => navigator.clipboard.writeText(value))
      .then(() => popup.toast(done))
      .catch((error: unknown) => popup.toast(popup.errorText(error)));

  const actions =
    item.kind === 'login'
      ? [
          h('button', {
            class: 'button tonal small',
            type: 'button',
            text: t('fill'),
            onClick: () => void fill(popup, item, false, entry),
          }),
          iconButton('person', t('copyUsername'), () => void copy('username', t('copiedUsername'))),
          iconButton('copy', t('copyPassword'), () => void copy('password', t('copiedPassword'))),
        ]
      : [iconButton('copy', t('copyNote'), () => void copy('notes', t('copiedNote')))];

  const entry = h(
    'div',
    { class: 'item' },
    h(
      'div',
      { class: 'what' },
      h('div', { class: 'title', text: `${item.favorite ? '★ ' : ''}${item.title}` }),
      h('div', {
        class: 'sub',
        text: item.username || item.site || t(item.kind === 'note' ? 'kindNote' : 'kindLogin'),
      }),
    ),
    h('div', { class: 'actions' }, ...actions),
  );
  return entry;
}

/** Fills the page; a login of another site is filled only after the user confirms it. */
async function fill(
  popup: Popup,
  item: ItemSummary,
  force: boolean,
  entry: HTMLElement,
): Promise<void> {
  let result: FillResult;
  try {
    result = await ask<FillResult>({ type: 'fill', id: item.id, force });
  } catch (error) {
    popup.toast(popup.errorText(error));
    return;
  }
  if (result.status === 'filled') {
    window.close();
  } else if (result.status === 'no-form') {
    popup.toast(t('noForm'));
  } else {
    entry.after(confirmOtherSite(popup, item, result.site, entry));
  }
}

function confirmOtherSite(
  popup: Popup,
  item: ItemSummary,
  page: string,
  entry: HTMLElement,
): HTMLElement {
  const box: HTMLElement = h(
    'div',
    { class: 'warning', attrs: { role: 'alert' } },
    h('p', { text: t('otherSite', item.site || item.title, page) }),
    h(
      'div',
      { class: 'actions' },
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('cancel'),
        onClick: () => box.remove(),
      }),
      h('button', {
        class: 'button filled small danger',
        type: 'button',
        text: t('fillAnyway'),
        onClick: () => {
          box.remove();
          void fill(popup, item, true, entry);
        },
      }),
    ),
  );
  return box;
}

/** "Save the password for example.com?" — what was typed into the page and is not in the vault. */
/** A login typed into the page and not in the vault yet: save it, not now, never here. */
export function offerBanner(popup: Popup, offer: SaveOffer): HTMLElement {
  const answer = (message: Parameters<typeof ask>[0], done?: string) =>
    void ask(message)
      .then(() => (done ? popup.toast(done) : undefined))
      .then(() => popup.reload())
      .catch((error: unknown) => popup.toast(popup.errorText(error)));
  const mode = offer.mode === 'update' ? 'update' : 'save';
  return h(
    'div',
    { class: 'offer' },
    h('p', {
      class: 'title',
      text: t(mode === 'update' ? 'saveBarUpdate' : 'saveBarSave', offer.site),
    }),
    h('p', { class: 'sub', text: offer.username || t('saveBarNoLogin') }),
    h(
      'div',
      { class: 'actions' },
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('saveBarNever'),
        onClick: () => answer({ type: 'dismiss-offer', never: true }),
      }),
      h('button', {
        class: 'button text small',
        type: 'button',
        text: t('saveBarNotNow'),
        onClick: () => answer({ type: 'dismiss-offer', never: false }),
      }),
      h('button', {
        class: 'button filled small',
        type: 'button',
        text: t(mode === 'update' ? 'saveBarUpdateButton' : 'saveBarSaveButton'),
        onClick: () => answer({ type: 'save-offer', mode }, t('saved')),
      }),
    ),
  );
}
