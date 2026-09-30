import { Editor, Extensions, Mark, mergeAttributes } from '@tiptap/core';
import { HardBreak } from '@tiptap/extension-hard-break';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import { splitMarkEmoji } from '@pd/contracts';
import { DiaryImage, DiaryImageOptions } from './diary-images';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diaryMark: {
      /** Marks the selection with an emoji; with nothing selected — the whole paragraph. */
      setDiaryMark: (emoji: string) => ReturnType;
      /** Removes the mark under the cursor, keeping its text. */
      unsetDiaryMark: () => ReturnType;
    };
  }
}

/** `==` + optional emoji + text + `==`, as in `@pd/contracts` diary-marks (without blank lines). */
const MARK_SOURCE = /^==(?!=)((?:(?!\n\s*\n)[^=]|=(?!=))+?)==/;

/**
 * An emoji mark on a sentence or a paragraph: stored in Markdown as `==🔥 text==`
 * (see `@pd/contracts` diary-marks), shown as a highlight with the emoji in front.
 * The emoji is drawn by CSS from `data-emoji`, so it is not part of the editable text.
 */
export const DiaryMark = Mark.create({
  name: 'diaryMark',
  // Typing right after a mark does not extend it.
  inclusive: false,

  addAttributes() {
    return {
      emoji: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-emoji'),
        renderHTML: (attributes) =>
          attributes['emoji'] ? { 'data-emoji': attributes['emoji'] } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'mark' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes({ class: 'diary-mark' }, HTMLAttributes), 0];
  },

  markdownTokenName: 'diaryMark',
  markdownTokenizer: {
    name: 'diaryMark',
    level: 'inline',
    start: (src) => src.indexOf('=='),
    tokenize(src, _tokens, lexer) {
      const match = MARK_SOURCE.exec(src);
      if (!match) {
        return undefined;
      }
      const { emoji, text } = splitMarkEmoji(match[1]);
      return {
        type: 'diaryMark',
        raw: match[0],
        emoji,
        tokens: lexer.inlineTokens(text.trim()),
      };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.applyMark('diaryMark', helpers.parseInline(token.tokens ?? []), {
      emoji: token['emoji'] ?? null,
    }),
  renderMarkdown: (node, helpers) => {
    const emoji = node.attrs?.['emoji'];
    return `==${emoji ? `${emoji} ` : ''}${helpers.renderChildren(node)}==`;
  },

  addCommands() {
    return {
      setDiaryMark:
        (emoji) =>
        ({ state, chain }) => {
          const { empty, $from } = state.selection;
          const range = empty
            ? { from: $from.start(), to: $from.end() }
            : { from: state.selection.from, to: state.selection.to };
          return chain()
            .setTextSelection(range)
            .unsetMark(this.name)
            .setMark(this.name, { emoji })
            .run();
        },
      unsetDiaryMark:
        () =>
        ({ chain }) =>
          chain().extendMarkRange(this.name).unsetMark(this.name).run(),
    };
  },
});

/**
 * Entries are rendered with `breaks: true` (see MarkdownPipe): a single new line is a line
 * break. So a break is saved as a plain new line, not as Markdown's two trailing spaces.
 */
const LineBreak = HardBreak.extend({
  renderMarkdown: () => '\n',
});

export interface DiaryEditorOptions {
  /** A function: translations may load after the editor is created. */
  placeholder?: () => string;
  loadImage?: DiaryImageOptions['loadSrc'];
}

/** Everything the diary editor understands; the same list parses and saves Markdown. */
export function diaryEditorExtensions({
  placeholder = () => '',
  loadImage = async (src) => src,
}: DiaryEditorOptions = {}): Extensions {
  return [
    StarterKit.configure({
      hardBreak: false,
      // Markdown has no underline: Tiptap saves it as `++text++`, which nothing else renders.
      underline: false,
      link: { openOnClick: false, autolink: true },
    }),
    LineBreak,
    DiaryMark,
    DiaryImage.configure({ loadSrc: loadImage }),
    TaskList,
    TaskItem.configure({ nested: true }),
    // Saved as GFM tables; column widths are not part of Markdown, so no resizing.
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({ placeholder: () => placeholder() }),
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
  ];
}

/** A link whose text is its own address, `[https://…](https://…)`. */
const BARE_LINK = /\[(https?:\/\/[^\]\s]+)\]\(\1\)/g;
/** Tiptap puts an extra blank line before and after a table. */
const BLANK_BEFORE_TABLE = /\n{3,}(?=\|)/g;
const BLANK_AFTER_TABLE = /^(\|.*\|)\n{3,}/gm;

/**
 * The entry as Markdown. Tiptap leaves blank lines after a closing list or code block and
 * around tables, and writes a pasted address as `[url](url)`; these are tidied up so the
 * source stays as typed.
 */
export function entryMarkdown(editor: Editor): string {
  return editor
    .getMarkdown()
    .trimEnd()
    .replace(BARE_LINK, '$1')
    .replace(BLANK_BEFORE_TABLE, '\n\n')
    .replace(BLANK_AFTER_TABLE, '$1\n\n');
}
