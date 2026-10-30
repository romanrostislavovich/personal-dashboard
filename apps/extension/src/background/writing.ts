import {writingApi} from '@pd/client-core';
import {
  isSiteOf,
  siteOf,
  WritingCheckResult,
  WritingConfig,
  WritingRewriteMode,
  WritingSettingsUpdate,
} from '@pd/contracts';
import {PageCommand, WritingPopupState, WritingState} from '../shared/messages';
import {signedInClient} from './account';
import {readJson, writeJson} from './storage';

/*
 * Writing for the content scripts: the check of the text being typed and the AI's rewrites go
 * through the dashboard (LanguageTool on the user's own server). The settings are kept a few
 * minutes, so a page does not ask the server each time a field gets the focus.
 */

const CONFIG_KEY = 'writingConfig';
const CONFIG_TTL_MS = 5 * 60_000;

interface Cached {
  config: WritingConfig;
  at: number;
}

const NOTHING: WritingState = {check: false, rewrite: false};

/** Whether the fields of a page at this address are checked. */
export async function writingState(
  url: string | undefined,
): Promise<WritingState> {
  const config = await writingConfig().catch(() => null);
  const site = url ? siteOf(url) : null;
  if (
    !config?.enabled ||
    !site ||
    config.ignoredSites.some(one => isSiteOf(site, one))
  ) {
    return NOTHING;
  }
  return {check: config.canCheck, rewrite: config.canRewrite};
}

export async function checkWriting(
  url: string | undefined,
  text: string,
): Promise<WritingCheckResult> {
  await allowedOn(url);
  return writingApi((await signedInClient()).api).check({text});
}

export async function rewriteWriting(
  url: string | undefined,
  text: string,
  mode: WritingRewriteMode,
): Promise<string> {
  await allowedOn(url);
  return (await writingApi((await signedInClient()).api).rewrite({text, mode}))
    .text;
}

/** "Add to the dictionary" or "never show this" from the card of a mistake. */
export async function ignoreInWriting(
  word?: string,
  ruleId?: string,
): Promise<void> {
  const api = writingApi((await signedInClient()).api);
  const config = word
    ? await api.ignore({word})
    : ruleId
      ? await api.ignore({ruleId})
      : null;
  if (config) {
    await writeJson(chrome.storage.local, CONFIG_KEY, {
      config,
      at: Date.now(),
    } satisfies Cached);
  }
}

/** Fixes taken from the suggestions are counted on the server; a failure loses only the count. */
export async function acceptedInWriting(count: number): Promise<void> {
  if (Number.isInteger(count) && count > 0) {
    await writingApi((await signedInClient()).api).accepted(
      Math.min(count, 500),
    );
  }
}

/** For the popup: fresh from the server, as it may be just what the user came to change. */
export async function writingPopupState(
  url: string,
): Promise<WritingPopupState | null> {
  const site = siteOf(url);
  if (!site) {
    return null;
  }
  const config = await writingConfig({fresh: true});
  return {
    available: config.canCheck,
    enabled: config.enabled,
    onSite: !config.ignoredSites.some(one => isSiteOf(site, one)),
  };
}

/** On or off on the site of this address (the popup's switch, the badge's "not here"). */
export async function setWritingOnSite(
  url: string | undefined,
  on: boolean,
): Promise<void> {
  const site = url ? siteOf(url) : null;
  if (!site) {
    return;
  }
  const config = await writingConfig({fresh: true});
  const others = config.ignoredSites.filter(one => !isSiteOf(site, one));
  await saveWriting({ignoredSites: on ? others : [...others, site]});
}

/** Writing on or off everywhere, as in the settings of the dashboard. */
export async function setWritingEnabled(on: boolean): Promise<void> {
  await saveWriting({enabled: on});
}

async function saveWriting(update: WritingSettingsUpdate): Promise<void> {
  const config = await writingApi((await signedInClient()).api).saveSettings(
    update,
  );
  await writeJson(chrome.storage.local, CONFIG_KEY, {
    config,
    at: Date.now(),
  } satisfies Cached);
  await tellTabs();
}

/** The pages ask whether to check once: told to ask again. */
async function tellTabs(): Promise<void> {
  const command: PageCommand = {type: 'writing-changed'};
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) {
      void chrome.tabs.sendMessage(tab.id, command).catch(() => undefined);
    }
  }
}

/** A page that the settings leave alone gets nothing, whatever its script asks. */
async function allowedOn(url: string | undefined): Promise<void> {
  if (!(await writingState(url)).check) {
    throw new Error('Writing is off on this page');
  }
}

async function writingConfig({fresh = false} = {}): Promise<WritingConfig> {
  const cached = await readJson<Cached | null>(
    chrome.storage.local,
    CONFIG_KEY,
    null,
  );
  if (!fresh && cached && Date.now() - cached.at < CONFIG_TTL_MS) {
    return cached.config;
  }
  const config = await writingApi((await signedInClient()).api).settings();
  await writeJson(chrome.storage.local, CONFIG_KEY, {
    config,
    at: Date.now(),
  } satisfies Cached);
  return config;
}
