import {
  appendNote,
  countWords,
  extractTags,
  hasText,
  mergeOverChanged,
  searchSnippet,
} from './diary-text';

describe('extractTags', () => {
  it('finds hashtags in Cyrillic and Latin, lowercased and unique', () => {
    expect(
      extractTags('Утром #Спорт, потом #work и снова #спорт. #side_project'),
    ).toEqual(['спорт', 'work', 'side_project']);
  });

  it('ignores markdown headings and anchors inside words', () => {
    expect(extractTags('# Заголовок\n## Ещё\nemail@host#frag и c#')).toEqual(
      [],
    );
  });
});

describe('appendNote', () => {
  it('starts an empty entry with the note', () => {
    expect(appendNote('', ' Первая мысль ', '09:15')).toBe(
      '**09:15** Первая мысль',
    );
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
    expect(appendNote('Morning.', 'Evening walk', null)).toBe(
      'Morning.\n\nEvening walk',
    );
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

describe('an entry written over a version that changed since', () => {
  const stored = {
    content: 'Written on the computer.',
    mood: 4,
    updatedAt: new Date('2026-10-24T10:00:00.000Z'),
  };

  it('keeps the stored text and adds the new one below a line', () => {
    const merged = mergeOverChanged(stored, {
      content: 'Written on the train.',
      mood: 2,
      basedOn: '2026-10-24T08:00:00.000Z',
    });
    expect(merged).toEqual({
      content: 'Written on the computer.\n\n---\n\nWritten on the train.',
      mood: 4,
    });
  });

  it('counts an entry that did not exist when writing began as changed', () => {
    expect(
      mergeOverChanged(stored, {content: 'New', mood: null, basedOn: null})
        ?.content,
    ).toBe('Written on the computer.\n\n---\n\nNew');
  });

  it('replaces as usual when nothing changed, nothing is stored or no check is asked', () => {
    const input = {
      content: 'Edited',
      mood: 3,
      basedOn: '2026-10-24T10:00:00.000Z',
    };
    expect(mergeOverChanged(stored, input)).toBeNull();
    expect(mergeOverChanged(null, input)).toBeNull();
    expect(mergeOverChanged(stored, {content: 'Edited', mood: 3})).toBeNull();
    expect(
      mergeOverChanged(stored, {
        ...input,
        content: stored.content,
        basedOn: null,
      }),
    ).toBeNull();
  });

  it('never deletes the stored text with an empty one', () => {
    expect(
      mergeOverChanged(stored, {
        content: ' ',
        mood: null,
        basedOn: '2026-10-24T08:00:00.000Z',
      }),
    ).toEqual({content: stored.content, mood: 4});
  });
});
