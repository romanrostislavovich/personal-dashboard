import { markSelection, parseDiaryMarks, splitMarkEmoji, unmarkAt } from './diary-marks';

describe('parseDiaryMarks', () => {
  it('finds emoji marks, including emoji with a variation selector', () => {
    const text = 'Утро. ==🔥 Закончил релиз== и ==❤️ ужин с семьёй==. ==просто выделение==';
    expect(parseDiaryMarks(text)).toEqual([
      { emoji: '🔥', text: 'Закончил релиз' },
      { emoji: '❤️', text: 'ужин с семьёй' },
    ]);
  });

  it('does not cross blank lines', () => {
    expect(parseDiaryMarks('==🔥 first\n\nsecond==')).toEqual([]);
    expect(parseDiaryMarks('==🔥 line one\nline two==')).toEqual([
      { emoji: '🔥', text: 'line one\nline two' },
    ]);
  });
});

describe('splitMarkEmoji', () => {
  it('separates the leading emoji', () => {
    expect(splitMarkEmoji('💡 idea')).toEqual({ emoji: '💡', text: 'idea' });
    expect(splitMarkEmoji('plain')).toEqual({ emoji: null, text: 'plain' });
  });
});

describe('markSelection', () => {
  it('wraps the selection and keeps spaces outside', () => {
    const content = 'Hello big world';
    const edit = markSelection(content, 5, 10, '⭐');
    expect(edit.content).toBe('Hello ==⭐ big== world');
  });

  it('marks the paragraph under the cursor when nothing is selected', () => {
    const content = 'First paragraph.\n\nSecond one here.\n\nThird.';
    const edit = markSelection(content, content.indexOf('one'), content.indexOf('one'), '💡');
    expect(edit.content).toBe('First paragraph.\n\n==💡 Second one here.==\n\nThird.');
  });

  it('marks each paragraph of a multi-paragraph selection', () => {
    const content = 'A a.\n\nB b.';
    expect(markSelection(content, 0, content.length, '🔥').content).toBe(
      '==🔥 A a.==\n\n==🔥 B b.==',
    );
  });
});

describe('unmarkAt', () => {
  it('removes the mark around the cursor', () => {
    const content = 'x ==🔥 hot== y';
    expect(unmarkAt(content, 6)?.content).toBe('x hot y');
    expect(unmarkAt(content, 0)).toBeNull();
  });
});
