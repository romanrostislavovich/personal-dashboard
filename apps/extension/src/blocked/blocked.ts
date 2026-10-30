import {ask} from '../shared/messages';
import {BlockReason} from '../shared/site-rules';
import {h, t} from '../popup/dom';

/*
 * Shown instead of a site kept closed (see background/sites.ts): why — a focus session of the
 * desktop app, or the daily limit of the site — and the way out: close the tab, or open the
 * site anyway for a few minutes.
 */

const params = new URLSearchParams(location.search);
const site = params.get('site') ?? '';
const back = params.get('back') ?? '';

void show();

async function show(): Promise<void> {
  document.title = site;
  const block = await ask<BlockReason | null>({
    type: 'blocked-info',
    back,
  }).catch(() => null);
  if (!block) {
    // Not closed any more (the session ended, a new day): the site itself.
    location.replace(back);
    return;
  }
  const app = document.getElementById('app') as HTMLElement;
  app.replaceChildren(
    h('div', {class: 'emoji', text: block.reason === 'focus' ? '🎯' : '⏳'}),
    h('h1', {text: title(block)}),
    h('p', {text: hint(block)}),
    h(
      'div',
      {class: 'actions'},
      h('button', {
        class: 'primary',
        type: 'button',
        text: t('blockedClose'),
        onClick: () => void closeTab(),
      }),
      h('button', {
        type: 'button',
        text: t('blockedAnyway'),
        onClick: () => void openAnyway(),
      }),
    ),
  );
}

function title(block: BlockReason): string {
  return block.reason === 'focus'
    ? t('blockedFocusTitle')
    : t('blockedLimitTitle', site);
}

function hint(block: BlockReason): string {
  if (block.reason === 'focus') {
    const until = new Date(block.until).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return t('blockedFocusHint', site, until);
  }
  return t(
    'blockedLimitHint',
    minutes(block.usedSeconds),
    minutes(block.minutes * 60),
  );
}

/** 1 h 05 min, 40 min. */
function minutes(seconds: number): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  return hours
    ? t('blockedHours', String(hours), String(total % 60).padStart(2, '0'))
    : t('blockedMinutes', String(total));
}

async function openAnyway(): Promise<void> {
  await ask({type: 'pass-site', site});
  location.replace(back);
}

async function closeTab(): Promise<void> {
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id !== undefined) {
    await chrome.tabs.remove(tab.id);
  }
}
