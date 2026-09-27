import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

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
