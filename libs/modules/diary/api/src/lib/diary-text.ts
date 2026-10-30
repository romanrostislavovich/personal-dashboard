import {diaryPlainText} from '@pd/contracts';

/**
 * Tags are hashtags in the text: `#work`, `#side_project`. Markdown headings (`# Heading`)
 * are not tags because there is a space after `#`.
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/(?<![\p{L}\p{N}_&])#([\p{L}\p{N}_-]+)/gu);
  return [...new Set([...matches].map(match => match[1].toLowerCase()))];
}

/**
 * Appends a note (for example, from Telegram) to the end of the entry, with a timestamp
 * when it is written today (`time = null` for notes added to past days).
 */
export function appendNote(
  content: string,
  note: string,
  time: string | null,
): string {
  const line = time ? `**${time}** ${note.trim()}` : note.trim();
  return content.trim() ? `${content.trimEnd()}\n\n${line}` : line;
}

/**
 * An entry written over an older version of the day (`basedOn`) while another device changed
 * it: the stored text stays and the new one goes below a line, so neither is lost; the stored
 * mood stays too. `null` — no conflict, the new text replaces the stored one as usual.
 */
export function mergeOverChanged(
  stored: {content: string; mood: number | null; updatedAt: Date} | null,
  input: {content: string; mood: number | null; basedOn?: string | null},
): {content: string; mood: number | null} | null {
  if (
    !stored ||
    input.basedOn === undefined ||
    stored.content === input.content
  ) {
    return null;
  }
  const changed =
    input.basedOn === null ||
    stored.updatedAt.getTime() > Date.parse(input.basedOn);
  if (!changed) {
    return null;
  }
  const added = input.content.trim();
  return {
    content: added
      ? `${stored.content.trimEnd()}\n\n---\n\n${added}`
      : stored.content,
    mood: stored.mood ?? input.mood,
  };
}

/** Words of an entry as written (its Markdown too); an empty entry has none. */
export function countWords(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Whether an entry has the words searched for, whatever the case. */
export function hasText(content: string, query: string): boolean {
  return content.toLowerCase().includes(query.toLowerCase());
}

export function shorten(text: string, maxLength: number): string {
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trimEnd()}…`
    : text;
}

/** Plain text around the first case-insensitive match of `query` (or the beginning). */
export function searchSnippet(
  content: string,
  query: string,
  radius = 80,
): string {
  const plain = diaryPlainText(content);
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return shorten(plain, radius * 2);
  }
  const from = Math.max(0, index - radius);
  const to = Math.min(plain.length, index + query.length + radius);
  return `${from > 0 ? '…' : ''}${plain.slice(from, to).trim()}${to < plain.length ? '…' : ''}`;
}
