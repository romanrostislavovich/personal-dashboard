/**
 * Теги — это хэштеги в тексте: `#работа`, `#side_project`. Заголовки markdown (`# Заголовок`)
 * не считаются тегами, потому что после `#` там пробел.
 */
export function extractTags(content: string): string[] {
  const matches = content.matchAll(/(?<![\p{L}\p{N}_&])#([\p{L}\p{N}_-]+)/gu);
  return [...new Set([...matches].map((match) => match[1].toLowerCase()))];
}

/** Дописывает заметку (например, из Telegram) в конец записи с отметкой времени. */
export function appendNote(content: string, note: string, time: string): string {
  const line = `**${time}** ${note.trim()}`;
  return content.trim() ? `${content.trimEnd()}\n\n${line}` : line;
}
