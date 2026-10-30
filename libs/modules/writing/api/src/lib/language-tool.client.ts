import {fetchWithTimeout} from '@pd/api-core';
import {WritingIssue, WritingIssueKind} from '@pd/contracts';

/** A check that takes longer is given up: the text is checked again on the next pause. */
const TIMEOUT_MS = 15_000;
const MAX_REPLACEMENTS = 5;

/** What LanguageTool answers on `/v2/check` (the parts used). */
interface CheckAnswer {
  language: {code: string; detectedLanguage?: {code: string}};
  matches: {
    message: string;
    shortMessage?: string;
    offset: number;
    length: number;
    replacements: {value: string}[];
    rule: {id: string; issueType?: string; category: {id: string}};
  }[];
}

export interface LanguageToolRequest {
  text: string;
  /** `auto` or a code (`ru-RU`). */
  language: string;
  englishVariant: string;
  picky: boolean;
  disabledRules: string[];
  /** The language of the interface: what the messages of a check are written in. */
  motherTongue?: string;
}

/** Whether a LanguageTool server answers at the address (the owner is setting it). */
export async function languageToolAnswers(baseUrl: string): Promise<boolean> {
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/+$/, '')}/v2/languages`,
    {},
    TIMEOUT_MS,
  ).catch(() => null);
  return Boolean(response?.ok);
}

/** One request to a LanguageTool server (the one set in Settings → Integrations). */
export async function checkWithLanguageTool(
  baseUrl: string,
  request: LanguageToolRequest,
): Promise<{language: string; issues: WritingIssue[]}> {
  const body = new URLSearchParams({
    text: request.text,
    language: request.language,
    // Told as English, the text is checked as the user's English.
    preferredVariants: request.englishVariant,
    ...(request.picky ? {level: 'picky'} : {}),
    ...(request.disabledRules.length
      ? {disabledRules: request.disabledRules.join(',')}
      : {}),
    ...(request.motherTongue ? {motherTongue: request.motherTongue} : {}),
  });
  const response = await fetchWithTimeout(
    `${baseUrl.replace(/\/+$/, '')}/v2/check`,
    {method: 'POST', body},
    TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(
      `LanguageTool ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const answer = (await response.json()) as CheckAnswer;
  return {
    language: answer.language.detectedLanguage?.code ?? answer.language.code,
    issues: answer.matches.map(match => ({
      offset: match.offset,
      length: match.length,
      kind: kindOf(match.rule),
      message: match.message,
      replacements: match.replacements
        .slice(0, MAX_REPLACEMENTS)
        .map(one => one.value),
      ruleId: match.rule.id,
    })),
  };
}

/** LanguageTool's category first (it is the more exact), then the type of the issue. */
export function kindOf(rule: {
  issueType?: string;
  category: {id: string};
}): WritingIssueKind {
  const category = rule.category.id;
  if (category === 'PUNCTUATION') return 'punctuation';
  if (category === 'TYPOGRAPHY') return 'typography';
  if (category === 'TYPOS' || rule.issueType === 'misspelling')
    return 'spelling';
  if (category === 'GRAMMAR' || rule.issueType === 'grammar') return 'grammar';
  if (
    category === 'STYLE' ||
    category === 'REDUNDANCY' ||
    rule.issueType === 'style'
  ) {
    return 'style';
  }
  if (rule.issueType === 'typographical' || rule.issueType === 'whitespace')
    return 'typography';
  return 'other';
}
