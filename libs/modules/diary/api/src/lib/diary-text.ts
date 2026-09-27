/**
 * Tags are hashtags in the text: `#work`, `#side_project`. Markdown headings (`# Heading`)
 * are not tags because there is a space after `#`.
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/(?<![\p{L}\p{N}_&])#([\p{L}\p{N}_-]+)/gu);
  return [...new Set([...matches].map((match) => match[1].toLowerCase()))];
}

/** Appends a note (for example, from Telegram) to the end of the entry with a timestamp. */
export function appendNote(content: string, note: string, time: string): string {
  const line = `**${time}** ${note.trim()}`;
  return content.trim() ? `${content.trimEnd()}\n\n${line}` : line;
}
