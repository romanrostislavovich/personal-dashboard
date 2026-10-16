import { splitMessage } from './split-message';

describe('splitMessage', () => {
  it('leaves a short text as it is', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('cuts at a paragraph, then at a line', () => {
    const text = `${'a'.repeat(60)}\n\n${'b'.repeat(30)}\n${'c'.repeat(30)}`;
    expect(splitMessage(text, 100)).toEqual([
      'a'.repeat(60),
      `${'b'.repeat(30)}\n${'c'.repeat(30)}`,
    ]);
    expect(splitMessage(`${'b'.repeat(70)}\n${'c'.repeat(70)}`, 100)).toEqual([
      'b'.repeat(70),
      'c'.repeat(70),
    ]);
  });

  it('never cuts an HTML entity or an emoji in two', () => {
    const entity = splitMessage(`${'x'.repeat(98)}&amp;tail`, 100);
    expect(entity[0]).toBe('x'.repeat(98));
    expect(entity[1]).toBe('&amp;tail');
    const emoji = splitMessage(`${'x'.repeat(99)}😀tail`, 100);
    expect(emoji[0]).toBe('x'.repeat(99));
    expect(emoji[1].startsWith('😀')).toBe(true);
  });

  it('keeps every part within the limit', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');
    const parts = splitMessage(words, 4096);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 4096)).toBe(true);
    expect(parts.join(' ')).toBe(words);
  });
});
