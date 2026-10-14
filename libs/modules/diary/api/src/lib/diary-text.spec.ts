import { appendNote, countWords, extractTags, hasText, searchSnippet } from './diary-text';

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

describe('words and search of an encrypted diary (done here, not in the database)', () => {
  it('counts the words as the database did: none in an empty entry', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords('  A walk\n\nby the **river** ')).toBe(5);
  });

  it('finds the words whatever their case', () => {
    expect(hasText('A walk by the River', 'river')).toBe(true);
    expect(hasText('Прогулка у РЕКИ', 'реки')).toBe(true);
    expect(hasText('A walk', 'sea')).toBe(false);
  });
});
