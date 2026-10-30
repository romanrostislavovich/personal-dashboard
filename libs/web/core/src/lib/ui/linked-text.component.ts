import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/** A piece of the text: plain, or a link. */
export interface TextPart {
  text: string;
  href: string | null;
}

/** `http(s)://…` up to a space; a dot, comma or bracket at the very end belongs to the sentence. */
const LINK = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]}'»]/gi;

/** The text cut into plain pieces and links. */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({text: text.slice(last, start), href: null});
    }
    parts.push({text: match[0], href: match[0]});
    last = start + match[0].length;
  }
  if (last < text.length) {
    parts.push({text: text.slice(last), href: null});
  }
  return parts;
}

/**
 * Text with its links clickable (they open in a new tab); line breaks kept. No HTML is read
 * from the text: the links are found and drawn as elements.
 */
@Component({
  selector: 'pd-linked-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (part of parts(); track $index) {
    @if (part.href) {
      <a [href]="part.href" target="_blank" rel="noopener noreferrer">{{
        part.text
      }}</a>
    } @else {
      {{ part.text }}
    }
  }`,
  styles: `
    :host {
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    a {
      color: var(--mat-sys-primary);
    }
  `,
})
export class LinkedTextComponent {
  readonly text = input.required<string>();
  protected readonly parts = computed(() => linkParts(this.text()));
}
