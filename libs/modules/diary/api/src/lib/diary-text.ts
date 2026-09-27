/**
 * Tags are hashtags in the text: `#work`, `#side_project`. Markdown headings (`# Heading`)
 * are not tags because there is a space after `#`.
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/(?<![\p{L}\p{N}_&])#([\p{L}\p{N}_-]+)/gu);
  return [...new Set([...matches].map((match) => match[1].toLowerCase()))];
}

/**
 * Appends a note (for example, from Telegram) to the end of the entry, with a timestamp
 * when it is written today (`time = null` for notes added to past days).
 */
export function appendNote(content: string, note: string, time: string | null): string {
  const line = time ? `**${time}** ${note.trim()}` : note.trim();
  return content.trim() ? `${content.trimEnd()}\n\n${line}` : line;
}

/** Markdown → plain text for previews and snippets (marks keep their emoji). */
export function toPlainText(content: string): string {
  return content
    .replace(/==/g, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[#*_`>~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function shorten(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

/** Plain text around the first case-insensitive match of `query` (or the beginning). */
export function searchSnippet(content: string, query: string, radius = 80): string {
  const plain = toPlainText(content);
  const index = plain.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return shorten(plain, radius * 2);
  }
  const from = Math.max(0, index - radius);
  const to = Math.min(plain.length, index + query.length + radius);
  return `${from > 0 ? '…' : ''}${plain.slice(from, to).trim()}${to < plain.length ? '…' : ''}`;
}
