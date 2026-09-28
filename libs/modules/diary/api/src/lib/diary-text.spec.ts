import { appendNote, extractTags, searchSnippet, toPlainText } from './diary-text';

describe('extractTags', () => {
  it('finds hashtags in Cyrillic and Latin, lowercased and unique', () => {
    expect(extractTags('Утром #Спорт, потом #work и снова #спорт. #side_project')).toEqual([
      'спорт',
      'work',
      'side_project',
    ]);
  });

  it('ignores markdown headings and anchors inside words', () => {
    expect(extractTags('# Заголовок\n## Ещё\nemail@host#frag и c#')).toEqual([]);
  });
});

describe('appendNote', () => {
  it('starts an empty entry with the note', () => {
    expect(appendNote('', ' Первая мысль ', '09:15')).toBe('**09:15** Первая мысль');
  });

  it('appends to existing text with a blank line', () => {
    expect(appendNote('Утро было хорошим.\n', 'Обед', '13:00')).toBe(
      'Утро было хорошим.\n\n**13:00** Обед',
    );
  });
});

describe('toPlainText', () => {
  it('drops markdown markup but keeps text and mark emoji', () => {
    expect(toPlainText('# Day\n**Bold** [link](https://x.y) ==🔥 hot==')).toBe(
      'Day Bold link 🔥 hot',
    );
  });
});

describe('searchSnippet', () => {
  it('cuts the text around the match', () => {
    const text = `${'a '.repeat(100)}needle ${'b '.repeat(100)}`;
    const snippet = searchSnippet(text, 'NEEDLE', 10);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle');
  });

  it('falls back to the beginning without a match', () => {
    expect(searchSnippet('short text', 'zzz')).toBe('short text');
  });
});

describe('appendNote without time', () => {
  it('adds a plain paragraph for past days', () => {
    expect(appendNote('Morning.', 'Evening walk', null)).toBe('Morning.\n\nEvening walk');
  });
});
