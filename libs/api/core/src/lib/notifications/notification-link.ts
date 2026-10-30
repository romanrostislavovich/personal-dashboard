import {Notification} from './notification-channel';

/** Sources that are a service inside a section: they are hidden with it, and lead to it. */
export const SOURCE_SECTIONS: Record<string, string> = {
  wakatime: 'development',
  steam: 'games',
  spotify: 'music',
  lastfm: 'music',
  bank: 'finance',
  browser: 'activity',
  desktop: 'activity',
  extension: 'activity',
};

/** The section a notification is about, as the menu names it. */
export function sectionOfSource(source: string): string {
  return SOURCE_SECTIONS[source] ?? source;
}

/** The pages of the dashboard's own messages (no section of their own). */
const CORE_PAGES: Record<string, string> = {
  integrations: '/settings?tab=integrations',
  automations: '/settings?tab=automations',
  sync: '/settings?tab=data',
  backup: '/settings?tab=data',
  achievements: '/achievements',
  ai: '/ai',
};

/** The sections with a page of their own (`/<id>`). */
const SECTION_PAGES = new Set([
  'activity',
  'birthdays',
  'development',
  'diary',
  'finance',
  'games',
  'habits',
  'health',
  'life',
  'monitoring',
  'movies',
  'music',
  'psychology',
  'security',
  'tasks',
  'weather',
  'writing',
  'screenshots',
]);

/**
 * Where a tap on a notification leads (a push, the desktop app's system notification, a toast):
 * the page the module named, else its section's page, else the home page.
 */
/** The notification's card in the bell: its text, its buttons, the questions after it. */
export function inboxLinkOf(id: string): string {
  return `/notifications/${id}`;
}

export function linkOf(
  notification: Pick<Notification, 'source' | 'link'>,
): string {
  if (notification.link) {
    return notification.link;
  }
  const section = sectionOfSource(notification.source);
  return (
    CORE_PAGES[section] ?? (SECTION_PAGES.has(section) ? `/${section}` : '/')
  );
}
