import { Pipe, PipeTransform } from '@angular/core';
import { splitMarkEmoji } from '@pd/contracts';
import { marked, TokenizerAndRendererExtension, Tokens } from 'marked';

/**
 * `==text==` → `<mark>` (the Obsidian highlight syntax). With an emoji in front
 * (`==🔥 text==`, diary marks) the emoji gets its own span for styling.
 */
const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src) {
    const match = /^==(?!=)((?:[^=]|=(?!=))+?)==/.exec(src);
    if (!match) {
      return undefined;
    }
    const { emoji, text } = splitMarkEmoji(match[1]);
    return {
      type: 'highlight',
      raw: match[0],
      emoji,
      tokens: this.lexer.inlineTokens(text),
    };
  },
  renderer(token) {
    const { emoji, tokens } = token as Tokens.Generic & { emoji: string | null };
    const body = this.parser.parseInline(tokens ?? []);
    return emoji
      ? `<mark class="md-mark"><span class="md-mark-emoji">${emoji}</span>${body}</mark>`
      : `<mark class="md-mark">${body}</mark>`;
  },
};

marked.use({ extensions: [highlight] });

/**
 * Markdown → HTML. The result is inserted via `[innerHTML]`, and Angular itself
 * strips anything dangerous from it (scripts, event handlers).
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(markdown: string): string {
    return marked.parse(markdown, { async: false, breaks: true, gfm: true });
  }
}
