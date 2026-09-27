import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

/**
 * Markdown → HTML. Результат вставляется через `[innerHTML]`, а Angular сам
 * вычищает из него опасное (скрипты, обработчики событий).
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(markdown: string): string {
    return marked.parse(markdown, { async: false, breaks: true, gfm: true });
  }
}
