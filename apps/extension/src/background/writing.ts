import { writingApi } from '@pd/client-core';
import {
  isSiteOf,
  siteOf,
  WritingCheckResult,
  WritingConfig,
  WritingRewriteMode,
} from '@pd/contracts';
import { WritingState } from '../shared/messages';
import { signedInClient } from './account';
import { readJson, writeJson } from './storage';

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

const NOTHING: WritingState = { check: false, rewrite: false };

/** Whether the fields of a page at this address are checked. */
export async function writingState(url: string | undefined): Promise<WritingState> {
  const config = await writingConfig().catch(() => null);
  const site = url ? siteOf(url) : null;
  if (!config?.enabled || !site || config.ignoredSites.some((one) => isSiteOf(site, one))) {
    return NOTHING;
  }
  return { check: config.canCheck, rewrite: config.canRewrite };
}

export async function checkWriting(
  url: string | undefined,
  text: string,
): Promise<WritingCheckResult> {
  await allowedOn(url);
  return writingApi((await signedInClient()).api).check({ text });
}

export async function rewriteWriting(
  url: string | undefined,
  text: string,
  mode: WritingRewriteMode,
): Promise<string> {
  await allowedOn(url);
  return (await writingApi((await signedInClient()).api).rewrite({ text, mode })).text;
}

/** "Add to the dictionary" or "never show this" from the card of a mistake. */
export async function ignoreInWriting(word?: string, ruleId?: string): Promise<void> {
  const api = writingApi((await signedInClient()).api);
  const config = word ? await api.ignore({ word }) : ruleId ? await api.ignore({ ruleId }) : null;
  if (config) {
    await writeJson(chrome.storage.local, CONFIG_KEY, { config, at: Date.now() } satisfies Cached);
  }
}

/** A page that the settings leave alone gets nothing, whatever its script asks. */
async function allowedOn(url: string | undefined): Promise<void> {
  if (!(await writingState(url)).check) {
    throw new Error('Writing is off on this page');
  }
}

async function writingConfig(): Promise<WritingConfig> {
  const cached = await readJson<Cached | null>(chrome.storage.local, CONFIG_KEY, null);
  if (cached && Date.now() - cached.at < CONFIG_TTL_MS) {
    return cached.config;
  }
  const config = await writingApi((await signedInClient()).api).settings();
  await writeJson(chrome.storage.local, CONFIG_KEY, { config, at: Date.now() } satisfies Cached);
  return config;
}
