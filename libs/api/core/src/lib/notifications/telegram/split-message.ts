/** Telegram takes at most 4096 characters in one message. */
const TELEGRAM_MESSAGE_LIMIT = 4096;

/** Where a part may end, best first: a paragraph, a line, a sentence, a word. */
const BREAKS = ['\n\n', '\n', '. ', ' '];

/**
 * A long text as several messages, each cut at a paragraph or a line where it can be — never
 * in the middle of an HTML entity (`&amp;`) or of an emoji.
 */
export function splitMessage(text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = cutAt(rest, limit);
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.trim()) {
    parts.push(rest);
  }
  return parts;
}

function cutAt(text: string, limit: number): number {
  const head = text.slice(0, limit);
  for (const mark of BREAKS) {
    const at = head.lastIndexOf(mark);
    // A break in the first half would leave a part too short: a harder cut is better.
    if (at > limit / 2) {
      return at + mark.length;
    }
  }
  const entity = head.lastIndexOf('&');
  if (entity > head.lastIndexOf(';') && entity > 0) {
    return entity;
  }
  const last = text.charCodeAt(limit - 1);
  // The first half of a surrogate pair (an emoji) stays with its second half.
  return last >= 0xd800 && last <= 0xdbff ? limit - 1 : limit;
}
