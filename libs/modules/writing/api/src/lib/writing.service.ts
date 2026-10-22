import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiService, DB, Database, ServerKeysService, UsersService } from '@pd/api-core';
import {
  DEFAULT_WRITING_SETTINGS,
  WritingCheck,
  WritingCheckResult,
  WritingConfig,
  WritingIgnore,
  WritingIssue,
  WritingRewriteInput,
  WritingSettings,
  WritingSettingsUpdate,
} from '@pd/contracts';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  checkWithLanguageTool,
  languageToolAnswers,
  LanguageToolRequest,
} from './language-tool.client';
import { REWRITE_INSTRUCTIONS } from './rewrite-instructions';
import { writingSettings } from './writing.schema';

/** A line shorter than this tells too little to tell its language by. */
const SHORT_LINE = 20;
/** The same line is asked about again and again as one types around it. */
const CACHE_SIZE = 1000;

/**
 * Writing: a text checked for spelling, grammar and punctuation by LanguageTool on this server
 * (the text goes nowhere else), and rewritten by the AI when asked. The user's dictionary and
 * the rules switched off are applied here, so every client gets the same marks.
 */
@Injectable()
export class WritingService {
  private readonly logger = new Logger(WritingService.name);
  /** Results by the text and the settings it was checked with; the oldest go first. */
  private readonly cache = new Map<string, WritingCheckResult>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ai: AiService,
    private readonly users: UsersService,
    private readonly keys: ServerKeysService,
  ) {}

  /** The LanguageTool server the owner set (Settings → Integrations). */
  private languageToolUrl(): Promise<string | null> {
    return this.keys.get('writing.languagetool-url');
  }

  /** The owner sets the LanguageTool server: it must answer first. */
  async setLanguageTool(url: string): Promise<void> {
    if (!(await languageToolAnswers(url))) {
      throw new BadRequestException('LanguageTool does not answer at this address');
    }
    await this.keys.set('writing.languagetool-url', url);
  }

  async removeLanguageTool(): Promise<void> {
    await this.keys.set('writing.languagetool-url', null);
  }

  async settings(userId: string): Promise<WritingSettings> {
    const [row] = await this.db
      .select()
      .from(writingSettings)
      .where(eq(writingSettings.userId, userId));
    if (!row) {
      return DEFAULT_WRITING_SETTINGS;
    }
    // The count of fixes is the achievements', not a setting.
    const { userId: _owner, fixesAccepted: _fixes, ...settings } = row;
    return settings;
  }

  /** The settings, and what this server can do: the clients hide what it cannot. */
  async config(userId: string): Promise<WritingConfig> {
    return {
      ...(await this.settings(userId)),
      canCheck: Boolean(await this.languageToolUrl()),
      canRewrite: (await this.ai.isConfigured(userId)) && (await this.ai.canSee(userId, 'writing')),
      languageTool: (await this.keys.isOwner(userId))
        ? { url: await this.languageToolUrl() }
        : null,
    };
  }

  /** Only the fields sent change. */
  async saveSettings(userId: string, update: WritingSettingsUpdate): Promise<WritingConfig> {
    const settings = { ...(await this.settings(userId)), ...update };
    await this.db
      .insert(writingSettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({ target: writingSettings.userId, set: settings });
    return this.config(userId);
  }

  /** "Add to the dictionary" or "never show this" from the card of a mistake. */
  async ignore(userId: string, what: WritingIgnore): Promise<WritingConfig> {
    const settings = await this.settings(userId);
    return 'word' in what
      ? this.saveSettings(userId, { dictionary: unique([...settings.dictionary, what.word]) })
      : this.saveSettings(userId, {
          disabledRules: unique([...settings.disabledRules, what.ruleId]),
        });
  }

  /** Fixes taken from the suggestions are counted (the text itself never comes here). */
  async accepted(userId: string, count: number): Promise<void> {
    await this.db
      .insert(writingSettings)
      .values({ userId, fixesAccepted: count })
      .onConflictDoUpdate({
        target: writingSettings.userId,
        set: { fixesAccepted: sql`${writingSettings.fixesAccepted} + ${count}` },
      });
  }

  async fixesAccepted(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: writingSettings.fixesAccepted })
      .from(writingSettings)
      .where(eq(writingSettings.userId, userId));
    return row?.value ?? 0;
  }

  async check(userId: string, input: WritingCheck): Promise<WritingCheckResult> {
    const url = await this.languageToolUrl();
    if (!url) {
      throw new ServiceUnavailableException('LanguageTool is not set up on the server');
    }
    if (!input.text.trim()) {
      return { language: input.language ?? 'auto', issues: [] };
    }
    const settings = await this.settings(userId);
    const request = {
      text: input.text,
      language: input.language ?? settings.language,
      englishVariant: settings.englishVariant,
      picky: settings.picky,
      disabledRules: settings.disabledRules,
      motherTongue: (await this.users.findById(userId))?.locale,
    };
    // Each line on its own: a message may be half Russian, half English, and LanguageTool
    // tells one language a request. Typing changes one line, the rest come from the cache.
    // A line too short to tell its language by is checked in the language of the longest one.
    const lines = paragraphs(input.text);
    const checkLine = async (line: (typeof lines)[number], language: string) => ({
      offset: line.offset,
      length: line.text.length,
      result: await this.checkParagraph(url, { ...request, text: line.text, language }),
    });
    const long = lines.filter((line) => line.text.trim().length >= SHORT_LINE);
    const told = await Promise.all(long.map((line) => checkLine(line, request.language)));
    const longest = told.reduce<(typeof told)[number] | null>(
      (best, one) => (!best || one.length > best.length ? one : best),
      null,
    );
    const fallback = longest?.result.language ?? request.language;
    const short = await Promise.all(
      lines
        .filter((line) => line.text.trim().length < SHORT_LINE)
        .map((line) =>
          checkLine(
            line,
            request.language === 'auto' && sameScript(line.text, fallback)
              ? fallback
              : request.language,
          ),
        ),
    );
    const checked = [...told, ...short];
    const issues = checked.flatMap(({ offset, result }) =>
      result.issues.map((issue) => ({ ...issue, offset: issue.offset + offset })),
    );
    return {
      language: longest?.result.language ?? request.language,
      issues: withoutKnownWords(input.text, issues, settings.dictionary),
    };
  }

  private async checkParagraph(
    url: string,
    request: LanguageToolRequest,
  ): Promise<WritingCheckResult> {
    const key = createHash('sha256').update(JSON.stringify(request)).digest('base64url');
    const known = this.cache.get(key);
    if (known) {
      return known;
    }
    const result = await checkWithLanguageTool(url, request).catch((error) => {
      this.logger.warn(`LanguageTool failed: ${error}`);
      throw new ServiceUnavailableException('LanguageTool did not answer');
    });
    this.remember(key, result);
    return result;
  }

  /** The text as the AI rewrites it, in the text's own language. */
  async rewrite(userId: string, { text, mode }: WritingRewriteInput): Promise<string> {
    if (!(await this.ai.isConfigured(userId))) {
      throw new BadRequestException('AI is not configured');
    }
    const answer = await this.ai.complete(userId, REWRITE_INSTRUCTIONS[mode], text, 'writing', {
      keepLanguage: true,
    });
    return answer.trim();
  }

  private remember(key: string, result: WritingCheckResult): void {
    if (this.cache.size >= CACHE_SIZE) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    this.cache.set(key, result);
  }
}

/** The lines of a text with where each starts; blank ones left out. */
export function paragraphs(text: string): { offset: number; text: string }[] {
  const result: { offset: number; text: string }[] = [];
  const breaks = /\n\s*/g;
  let start = 0;
  for (const match of text.matchAll(breaks)) {
    result.push({ offset: start, text: text.slice(start, match.index) });
    start = (match.index ?? 0) + match[0].length;
  }
  result.push({ offset: start, text: text.slice(start) });
  return result.filter((paragraph) => paragraph.text.trim());
}

/**
 * Whether a short line is written in the alphabet of a language: "ok" goes with an English or a
 * Polish text, "привет" never does — then the line tells its language itself.
 */
export function sameScript(text: string, language: string): boolean {
  const cyrillic = /[Ѐ-ӿ]/.test(text);
  return cyrillic === /^(ru|uk|be|bg|sr|mk)\b/.test(language);
}

/** A misspelling of a word in the dictionary is not one (names, terms, slang). */
export function withoutKnownWords(
  text: string,
  issues: WritingIssue[],
  dictionary: string[],
): WritingIssue[] {
  if (!dictionary.length) {
    return issues;
  }
  const known = new Set(dictionary.map((word) => word.toLocaleLowerCase()));
  return issues.filter(
    (issue) =>
      issue.kind !== 'spelling' ||
      !known.has(text.slice(issue.offset, issue.offset + issue.length).toLocaleLowerCase()),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
