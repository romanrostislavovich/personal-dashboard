import {OpenVaultItem} from '@pd/contracts';
import {FillResult, PageCommand} from '../shared/messages';
import {matchesPage, sameSite, siteName} from '../shared/site';

/*
 * Filling a page. A password goes only into the frames of the tab that are on the login's own
 * site: not into an ad or a widget of another site inside the page, and not into a page of
 * another site at all unless the user confirmed it in the popup (`force`, then the top frame).
 */

export async function fillLogin(
  tabId: number,
  item: OpenVaultItem,
  force: boolean,
): Promise<FillResult> {
  const page = (await chrome.tabs.get(tabId)).url ?? '';
  if (!force && !matchesPage(item.urls, page)) {
    return {status: 'other-site', site: siteName(page)};
  }
  const frames = (await chrome.webNavigation.getAllFrames({tabId})) ?? [];
  const targets = frames.filter(
    frame =>
      matchesPage(item.urls, frame.url) || (force && frame.frameId === 0),
  );
  const filled = await send(tabId, targets, {
    type: 'fill',
    username: item.username,
    password: item.password,
  });
  return filled ? {status: 'filled'} : {status: 'no-form'};
}

/** A password from the generator: into the frames of the page's own site. */
export async function fillNewPassword(
  tabId: number,
  password: string,
): Promise<FillResult> {
  const page = (await chrome.tabs.get(tabId)).url ?? '';
  const frames = (await chrome.webNavigation.getAllFrames({tabId})) ?? [];
  const targets = frames.filter(
    frame => frame.frameId === 0 || sameSite(page, frame.url),
  );
  const filled = await send(tabId, targets, {
    type: 'fill-new-password',
    password,
  });
  return filled ? {status: 'filled'} : {status: 'no-form'};
}

async function send(
  tabId: number,
  frames: chrome.webNavigation.GetAllFrameResultDetails[],
  command: PageCommand,
): Promise<boolean> {
  const answers = await Promise.all(
    frames.map(frame =>
      chrome.tabs
        .sendMessage<PageCommand, {filled: boolean} | undefined>(
          tabId,
          command,
          {
            frameId: frame.frameId,
          },
        )
        // A frame without the content script (a page opened before the extension was installed).
        .catch(() => undefined),
    ),
  );
  return answers.some(answer => answer?.filled);
}

/**
 * The tab the user is looking at: the active one of the last focused browser window (not the
 * popup's own window), when it is a web page.
 */
export async function activeTab(): Promise<{id: number; url: string} | null> {
  const window = await chrome.windows
    .getLastFocused({windowTypes: ['normal']})
    .catch(() => null);
  if (window?.id === undefined) {
    return null;
  }
  const [tab] = await chrome.tabs.query({active: true, windowId: window.id});
  return tab?.id !== undefined && tab.url && /^https?:/.test(tab.url)
    ? {id: tab.id, url: tab.url}
    : null;
}
