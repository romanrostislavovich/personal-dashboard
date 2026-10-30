import {matchesPage} from '../shared/site';
import {isUnlocked, vaultItems} from './vault';

/** The number of logins for a tab's page on the toolbar icon, while the vault is open. */
export async function countLogins(tabId: number, url: string): Promise<void> {
  if (!(await isUnlocked())) {
    return;
  }
  const {items} = await vaultItems({use: false});
  const count = items.filter(
    item => item.kind === 'login' && matchesPage(item.urls, url),
  ).length;
  await chrome.action.setBadgeBackgroundColor({tabId, color: '#3f51b5'});
  await chrome.action.setBadgeText({tabId, text: count ? String(count) : ''});
}

/** Locked: no tab tells how many logins it has. */
export async function clearBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(tab =>
      tab.id === undefined
        ? undefined
        : chrome.action.setBadgeText({tabId: tab.id, text: ''}),
    ),
  );
}
