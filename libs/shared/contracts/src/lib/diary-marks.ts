/**
 * Emoji marks in diary text: a fragment wrapped as `==🔥 text==`.
 * It is the Obsidian highlight syntax with an emoji in front, so entries stay readable
 * as plain Markdown outside the dashboard. Used by the editor (wrap / unwrap) and by the
 * API (extract marks to filter entries by emoji).
 */

/** Default palette in the editor; any emoji works. */
export const DIARY_MARK_EMOJIS = ['❤️', '💡', '🔥', '😂', '😢', '🎯', '⭐', '🙏', '❓', '⚠️'];

export interface DiaryMark {
  emoji: string;
  text: string;
}

/** An emoji: a pictograph, optionally with a variation selector or joined (👨‍💻). */
const EMOJI = String.raw`\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*`;

/** `==` + emoji + text without blank lines + `==`. */
const MARK = new RegExp(String.raw`==(${EMOJI})\s*((?:(?!\n\s*\n)[^=]|=(?!=))+?)==`, 'gu');

const LEADING_EMOJI = new RegExp(String.raw`^(${EMOJI})\s*`, 'u');

export function parseDiaryMarks(content: string): DiaryMark[] {
  return [...content.matchAll(MARK)].map((match) => ({
    emoji: match[1],
    text: match[2].trim(),
  }));
}

/** Splits highlighted text into its emoji and the rest (`null` emoji for a plain `==text==`). */
export function splitMarkEmoji(text: string): { emoji: string | null; text: string } {
  const match = LEADING_EMOJI.exec(text);
  return match ? { emoji: match[1], text: text.slice(match[0].length) } : { emoji: null, text };
}

export interface TextEdit {
  content: string;
  /** Where to put the selection after the edit. */
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Marks the selected text with an emoji. An empty selection marks the whole paragraph
 * under the cursor; a selection over several paragraphs marks each of them.
 * Surrounding spaces stay outside the mark.
 */
export function markSelection(
  content: string,
  start: number,
  end: number,
  emoji: string,
): TextEdit {
  const [from, to] = start === end ? paragraphAt(content, start) : [start, end];
  // With a capturing split, odd pieces are the blank-line separators between paragraphs.
  const pieces = content.slice(from, to).split(/(\n\s*\n)/);
  const marked = pieces
    .map((piece, index) => {
      const text = piece.trim();
      if (!text || index % 2 === 1) {
        return piece;
      }
      const lead = piece.slice(0, piece.indexOf(text));
      const trail = piece.slice(lead.length + text.length);
      return `${lead}==${emoji} ${text}==${trail}`;
    })
    .join('');
  const result = content.slice(0, from) + marked + content.slice(to);
  return { content: result, selectionStart: from, selectionEnd: from + marked.length };
}

/** Removes the mark around `position`, keeping its text. `null` if the cursor is not in a mark. */
export function unmarkAt(content: string, position: number): TextEdit | null {
  for (const match of content.matchAll(MARK)) {
    const start = match.index;
    const end = start + match[0].length;
    if (position >= start && position <= end) {
      const text = match[2].trim();
      return {
        content: content.slice(0, start) + text + content.slice(end),
        selectionStart: start,
        selectionEnd: start + text.length,
      };
    }
  }
  return null;
}

/** Bounds of the paragraph (text between blank lines) that contains `position`. */
function paragraphAt(content: string, position: number): [number, number] {
  const before = content.slice(0, position).search(/\n\s*\n(?![\s\S]*\n\s*\n)/);
  const from = before === -1 ? 0 : content.indexOf('\n', before + 1) + 1;
  const afterMatch = /\n\s*\n/.exec(content.slice(position));
  const to = afterMatch ? position + afterMatch.index : content.length;
  return [Math.max(0, from), to];
}
