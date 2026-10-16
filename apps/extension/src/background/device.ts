import { DeviceLink, DeviceTool } from '@pd/client-core';
import { PageSnapshot } from '../shared/messages';
import { signedInClient, serverUrl } from './account';
import { readJson, writeJson } from './storage';

/*
 * This browser as a device of the dashboard: while it is online, the assistant (in the
 * dashboard, in Telegram) and the outside AI clients (Claude Desktop over MCP) may ask what
 * page is open, which tabs are, and open a link. Each tool is switched on or off in the popup;
 * the text of a page is off until the user switches it on. Private windows never.
 */

const SETTINGS_KEY = 'deviceTools';

/** What the assistant may ask of this browser. */
export interface DeviceToolSettings {
  /** The address, the title and the selected text of the page in front. */
  currentPage: boolean;
  /** The readable text of that page too (an article, a document). */
  pageText: boolean;
  openTabs: boolean;
  openUrl: boolean;
}

const DEFAULTS: DeviceToolSettings = {
  currentPage: true,
  pageText: false,
  openTabs: true,
  openUrl: true,
};

let link: DeviceLink | null = null;
let settings: DeviceToolSettings = DEFAULTS;
/** "Active" is told at most this often: the tab switches of a minute are one. */
const ACTIVE_EVERY_MS = 30_000;
let toldActiveAt = 0;

export async function deviceSettings(): Promise<DeviceToolSettings> {
  return {
    ...DEFAULTS,
    ...(await readJson<Partial<DeviceToolSettings>>(chrome.storage.local, SETTINGS_KEY, {})),
  };
}

export async function saveDeviceSettings(
  update: Partial<DeviceToolSettings>,
): Promise<DeviceToolSettings> {
  settings = { ...(await deviceSettings()), ...update };
  await writeJson(chrome.storage.local, SETTINGS_KEY, settings);
  link?.toolsChanged();
  return settings;
}

export function deviceOnline(): boolean {
  return link?.connected ?? false;
}

/** Signed in: the link goes up (again after the worker woke); signed out: down. */
export async function startDevice(): Promise<void> {
  const server = await serverUrl();
  const client = await signedInClient().catch(() => null);
  if (!server || !client) {
    stopDevice();
    return;
  }
  settings = await deviceSettings();
  if (link) {
    return;
  }
  link = new DeviceLink({
    server,
    kind: 'browser',
    name: browserName(),
    // A fresh token for every hello: the access token lives fifteen minutes.
    accessToken: async () => (await client.api.refresh())?.accessToken ?? null,
    tools: () => tools(),
  });
  link.start();
}

export function stopDevice(): void {
  link?.stop();
  link = null;
}

/** The user is at this browser now: its tools answer before another one's. */
export function deviceActive(): void {
  if (Date.now() - toldActiveAt > ACTIVE_EVERY_MS) {
    toldActiveAt = Date.now();
    link?.active();
  }
}

function tools(): DeviceTool[] {
  const list: DeviceTool[] = [];
  if (settings.currentPage) {
    list.push({
      name: 'browser_current_page',
      description:
        "The page open in front in the user's browser: its address, title and the text the user " +
        'selected' +
        (settings.pageText
          ? '; with `withText: true` also its readable text (up to 30 000 characters).'
          : '. Its text is not shared (the user has not allowed it).') +
        ' Useful for "save this page", "what am I reading", "summarise this".',
      inputSchema: {
        type: 'object',
        properties: settings.pageText
          ? { withText: { type: 'boolean', description: 'Also the text of the page' } }
          : {},
      },
      run: (args) => currentPage(settings.pageText && args['withText'] === true),
    });
  }
  if (settings.openTabs) {
    list.push({
      name: 'browser_open_tabs',
      description: "The tabs open in the user's browser (title, address, which is in front).",
      inputSchema: { type: 'object', properties: {} },
      run: openTabs,
    });
  }
  if (settings.openUrl) {
    list.push({
      name: 'browser_open_url',
      description: "Opens an address (http or https) in a new tab of the user's browser.",
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'https://…' } },
        required: ['url'],
      },
      writes: true,
      run: (args) => openUrl(String(args['url'] ?? '')),
    });
  }
  return list;
}

async function currentPage(withText: boolean): Promise<unknown> {
  // A browser window, not the popup or a window of the extension's own pages.
  const window = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
  if (!window?.id || window.incognito) {
    return { page: null, note: 'No normal browser window in front' };
  }
  const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    return { page: null, note: 'The tab in front is not a web page' };
  }
  const shown = (await chrome.tabs
    .sendMessage(tab.id, { type: 'snapshot', withText })
    .catch(() => null)) as PageSnapshot | null;
  return {
    url: tab.url,
    title: tab.title ?? '',
    selection: shown?.selection ?? '',
    ...(withText ? { text: shown?.text ?? null } : {}),
  };
}

async function openTabs(): Promise<unknown> {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => !tab.incognito && tab.url && /^https?:/.test(tab.url))
    .slice(0, 100)
    .map((tab) => ({ title: tab.title ?? '', url: tab.url, active: tab.active }));
}

async function openUrl(url: string): Promise<unknown> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Only http and https addresses are opened');
  }
  const tab = await chrome.tabs.create({ url });
  return { opened: tab.url ?? url };
}

/** "Chrome on Windows": what the user sees in the list of their devices. */
function browserName(): string {
  const brands = (navigator as { userAgentData?: { brands?: { brand: string }[] } }).userAgentData
    ?.brands;
  const brand =
    brands?.map((one) => one.brand).find((one) => !/Not.?A.?Brand|Chromium/i.test(one)) ?? 'Chrome';
  const os = /Windows/i.test(navigator.userAgent)
    ? 'Windows'
    : /Mac/i.test(navigator.userAgent)
      ? 'macOS'
      : 'Linux';
  return `${brand} (${os})`;
}
