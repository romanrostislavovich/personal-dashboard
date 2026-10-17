import { z } from 'zod';
import { siteDomainSchema } from './activity-sites';

// Writing: a text checked for spelling, grammar and punctuation (LanguageTool on the server)
// and rewritten by the AI on request — on the Writing page, in the browser extension and in
// the desktop app.

/** `auto` — told by the text itself; the others are LanguageTool's codes. */
export const WRITING_LANGUAGES = ['auto', 'ru-RU', 'uk-UA', 'en-US', 'en-GB', 'pl-PL'] as const;
export type WritingLanguage = (typeof WRITING_LANGUAGES)[number];

/** The longest text checked at once: a client sends the paragraphs around the change. */
export const WRITING_CHECK_MAX = 20_000;
export const WRITING_REWRITE_MAX = 8_000;

export const writingCheckSchema = z.object({
  text: z.string().max(WRITING_CHECK_MAX),
  /** The user's setting when left out. */
  language: z.enum(WRITING_LANGUAGES).optional(),
});
export type WritingCheck = z.infer<typeof writingCheckSchema>;

/** What a mistake is, for its colour and for the rules switched off together. */
export const WRITING_ISSUE_KINDS = [
  'spelling',
  'grammar',
  'punctuation',
  'style',
  'typography',
  'other',
] as const;
export type WritingIssueKind = (typeof WRITING_ISSUE_KINDS)[number];

/** A mistake: where it is in the text (UTF-16 offsets, as JavaScript counts), and the fixes. */
export interface WritingIssue {
  offset: number;
  length: number;
  kind: WritingIssueKind;
  message: string;
  /** The best first; at most a few. */
  replacements: string[];
  /** LanguageTool's rule: "never show this one" switches it off. */
  ruleId: string;
}

export interface WritingCheckResult {
  /** The language the text was checked in (`ru-RU`), told by the text when `auto`. */
  language: string;
  issues: WritingIssue[];
}

/** What the AI does with a text. */
export const WRITING_REWRITE_MODES = ['fix', 'shorter', 'polite', 'formal', 'friendly'] as const;
export type WritingRewriteMode = (typeof WRITING_REWRITE_MODES)[number];

export const writingRewriteSchema = z.object({
  text: z.string().trim().min(1).max(WRITING_REWRITE_MAX),
  mode: z.enum(WRITING_REWRITE_MODES),
});
export type WritingRewriteInput = z.infer<typeof writingRewriteSchema>;

export interface WritingRewrite {
  text: string;
}

const word = z.string().trim().min(1).max(100);

export const writingSettingsSchema = z.object({
  /** The extension and the desktop app check as one types. */
  enabled: z.boolean(),
  language: z.enum(WRITING_LANGUAGES),
  /** Which English a text told as English is checked as. */
  englishVariant: z.enum(['en-US', 'en-GB']),
  /** Style and typography too, not only mistakes. */
  picky: z.boolean(),
  /** Words that are right (names, terms): never marked as misspelt. */
  dictionary: z.array(word).max(2000),
  /** LanguageTool's rules switched off ("never show this"). */
  disabledRules: z.array(z.string().trim().min(1).max(200)).max(500),
  /** Sites the extension leaves alone. */
  ignoredSites: z.array(siteDomainSchema).max(200),
  /** Programs the desktop app leaves alone (process names, lower case). */
  ignoredApps: z.array(z.string().trim().toLowerCase().min(1).max(120)).max(200),
});
export type WritingSettings = z.infer<typeof writingSettingsSchema>;

/** `PUT /api/writing/settings`: only the fields sent change. */
export const writingSettingsUpdateSchema = writingSettingsSchema.partial();
export type WritingSettingsUpdate = z.infer<typeof writingSettingsUpdateSchema>;

/** `GET /api/writing/settings`: the settings and what the server can do. */
export interface WritingConfig extends WritingSettings {
  /** The owner set the LanguageTool server (Settings → Integrations). */
  canCheck: boolean;
  /** An AI connection is set up and Writing is not switched off for it. */
  canRewrite: boolean;
  /** For the owner, who sets the LanguageTool server; `null` for the others. */
  languageTool: { url: string | null } | null;
}

/**
 * `PUT /api/writing/language-tool`: the address of a LanguageTool server —
 * `http://languagetool:8010` for the one in docker compose.
 */
export const languageToolInputSchema = z.object({ url: z.url({ protocol: /^https?$/ }) });
export type LanguageToolInput = z.infer<typeof languageToolInputSchema>;

export const DEFAULT_WRITING_SETTINGS: WritingSettings = {
  enabled: true,
  language: 'auto',
  englishVariant: 'en-US',
  picky: false,
  dictionary: [],
  disabledRules: [],
  ignoredSites: [],
  ignoredApps: [],
};

/** Adding one word or rule without sending the whole list (the card of a mistake). */
export const writingIgnoreSchema = z.union([
  z.object({ word }),
  z.object({ ruleId: z.string().trim().min(1).max(200) }),
]);
export type WritingIgnore = z.infer<typeof writingIgnoreSchema>;
