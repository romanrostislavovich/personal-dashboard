import { Editor } from '@tiptap/core';
import { parseDiaryMarks } from '@pd/contracts';
import { photoIdsIn, photoSrc } from './diary-images';
import { diaryEditorExtensions, entryMarkdown } from './diary-markdown';

function editorWith(markdown: string): Editor {
  return new Editor({
    extensions: diaryEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  });
}

/** Markdown → editor → Markdown. */
const roundTrip = (markdown: string) => entryMarkdown(editorWith(markdown));

describe('diary editor Markdown', () => {
  it('keeps emoji marks, with formatting inside', () => {
    const markdown = 'Morning. ==🔥 Finished the **release** today== and rested.';
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps a plain highlight without an emoji', () => {
    expect(roundTrip('Some ==highlighted== words')).toBe('Some ==highlighted== words');
  });

  it('keeps headings, lists, quotes and line breaks', () => {
    const markdown = [
      '## Day',
      '',
      'First line',
      'second line',
      '',
      '- one',
      '- two',
      '',
      '> a quote',
    ].join('\n');
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps images, task lists, links and Telegram notes', () => {
    const markdown = [
      '**08:15** Woke up early #morning',
      '',
      '![photo](https://example.com/a.png)',
      '',
      '- [ ] call mom',
      '- [x] run',
      '',
      '[a link](https://example.com) and https://example.org',
    ].join('\n');
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it('keeps tables and photos between paragraphs', () => {
    const markdown = [
      'Before',
      '',
      // Tiptap pads the columns: still a GFM table, and the source reads better.
      '| Day | Km        |',
      '| --- | --------- |',
      '| Mon | 5         |',
      '| Tue | ==🔥 12== |',
      '',
      `![](${photoSrc('0b6f7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b')})`,
      '',
      'After',
    ].join('\n');
    expect(roundTrip(markdown)).toBe(markdown);
    expect(photoIdsIn(markdown)).toEqual(['0b6f7c1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b']);
  });

  it('marks the paragraph under the cursor when nothing is selected', () => {
    const editor = editorWith('First paragraph\n\nSecond paragraph');
    editor.commands.setTextSelection(3);
    editor.commands.setDiaryMark('💡');
    expect(entryMarkdown(editor)).toBe('==💡 First paragraph==\n\nSecond paragraph');
    expect(parseDiaryMarks(entryMarkdown(editor))).toEqual([
      { emoji: '💡', text: 'First paragraph' },
    ]);
  });

  it('marks a selected sentence and replaces the emoji of a marked one', () => {
    const editor = editorWith('One. Two. Three.');
    // Positions count from 1 inside the paragraph: "Two." is 6–10.
    editor.commands.setTextSelection({ from: 6, to: 10 });
    editor.commands.setDiaryMark('❤️');
    expect(entryMarkdown(editor)).toBe('One. ==❤️ Two.== Three.');
    editor.commands.setTextSelection({ from: 6, to: 10 });
    editor.commands.setDiaryMark('🎯');
    expect(entryMarkdown(editor)).toBe('One. ==🎯 Two.== Three.');
  });

  it('removes the mark under the cursor', () => {
    const editor = editorWith('One. ==🔥 Two.== Three.');
    editor.commands.setTextSelection(8);
    editor.commands.unsetDiaryMark();
    expect(entryMarkdown(editor)).toBe('One. Two. Three.');
  });
});
