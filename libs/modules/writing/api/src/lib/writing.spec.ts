import { WritingIssue } from '@pd/contracts';
import { checkWithLanguageTool, kindOf } from './language-tool.client';
import { paragraphs, sameScript, withoutKnownWords } from './writing.service';

/** A LanguageTool server to check against, e.g. `docker compose up -d languagetool`. */
const LANGUAGETOOL_URL = process.env['TEST_LANGUAGETOOL_URL'];

describe('writing', () => {
  it('tells a mistake by its category first, then by its type', () => {
    expect(kindOf({ category: { id: 'TYPOS' } })).toBe('spelling');
    expect(kindOf({ issueType: 'misspelling', category: { id: 'MISC' } })).toBe('spelling');
    expect(kindOf({ issueType: 'typographical', category: { id: 'PUNCTUATION' } })).toBe(
      'punctuation',
    );
    expect(kindOf({ issueType: 'grammar', category: { id: 'GRAMMAR' } })).toBe('grammar');
    expect(kindOf({ issueType: 'whitespace', category: { id: 'MISC' } })).toBe('typography');
    expect(kindOf({ issueType: 'duplication', category: { id: 'MISC' } })).toBe('other');
  });

  it('cuts a text into its lines, with where each starts', () => {
    const text = 'Привет!\nHello there.\n  \n\nCześć';
    expect(paragraphs(text)).toEqual([
      { offset: 0, text: 'Привет!' },
      { offset: 8, text: 'Hello there.' },
      { offset: 25, text: 'Cześć' },
    ]);
    expect(paragraphs('  ')).toEqual([]);
  });

  it('tells whether a short line is written in the alphabet of a language', () => {
    expect(sameScript('ok, thanks', 'en-US')).toBe(true);
    expect(sameScript('ok, dzięki', 'pl-PL')).toBe(true);
    expect(sameScript('как дила?', 'en-US')).toBe(false);
    expect(sameScript('як справи?', 'uk-UA')).toBe(true);
  });

  it('leaves the words of the dictionary unmarked, whatever their case', () => {
    const text = 'Привет, Нестджс и дила';
    const issue = (word: string, kind: WritingIssue['kind'] = 'spelling'): WritingIssue => ({
      offset: text.indexOf(word),
      length: word.length,
      kind,
      message: '',
      replacements: [],
      ruleId: 'R',
    });
    const issues = [issue('Нестджс'), issue('дила'), issue('Привет', 'grammar')];
    expect(withoutKnownWords(text, issues, ['нестджс']).map((one) => one.offset)).toEqual([
      text.indexOf('дила'),
      0,
    ]);
  });

  it.skipIf(!LANGUAGETOOL_URL)(
    'finds the mistakes of every language it is asked about',
    async () => {
      const check = (text: string) =>
        checkWithLanguageTool(LANGUAGETOOL_URL as string, {
          text,
          language: 'auto',
          englishVariant: 'en-US',
          picky: false,
          disabledRules: [],
        });
      const ru = await check('Привет, как дила? Это не правельно.');
      expect(ru.language).toBe('ru-RU');
      expect(ru.issues.map((issue) => issue.replacements[0])).toContain('правильно');
      const pl = await check('Cześć, jak sie masz? To nie jest dobże.');
      expect(pl.language).toBe('pl-PL');
      expect(pl.issues.some((issue) => issue.replacements.includes('dobrze'))).toBe(true);
      const en = await check('I has a apple.');
      expect(en.language).toBe('en-US');
      expect(en.issues.length).toBeGreaterThan(0);
    },
  );
});
