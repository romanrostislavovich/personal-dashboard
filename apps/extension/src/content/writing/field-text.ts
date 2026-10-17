/*
 * The text of a field being typed in, and the way back from a place in that text to the page:
 * a textarea or an input holds its text as it is; a rich editor (`contenteditable`: Gmail,
 * Jira, Slack) is a tree, read as its text nodes with a line break between the blocks.
 */

export type TextField = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

/** Code editors check themselves (or should not be checked): left alone. */
const CODE_EDITORS = '.cm-editor, .CodeMirror, .monaco-editor, .ace_editor, [data-pd-no-writing]';
const BLOCKS = new Set([
  'ADDRESS',
  'BLOCKQUOTE',
  'DIV',
  'DD',
  'DT',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'P',
  'PRE',
  'TD',
  'TR',
]);

/** A text node and where its text starts in the text of the field. */
export interface Segment {
  node: Text;
  start: number;
}

export interface FieldText {
  text: string;
  /** For a rich editor only. */
  segments: Segment[] | null;
}

/** A field worth checking: one to write in, never a password, a code or a number. */
export function checkableField(target: EventTarget | null): TextField | null {
  if (target instanceof HTMLTextAreaElement) {
    return target.readOnly || target.disabled || target.closest(CODE_EDITORS) ? null : target;
  }
  if (target instanceof HTMLInputElement) {
    const type = target.type.toLowerCase();
    const plain =
      type === 'text' &&
      !/one-time-code|cc-|email|tel|url|username|name|address|postal/.test(target.autocomplete) &&
      !SEARCH.test(`${target.name} ${target.id} ${target.getAttribute('role') ?? ''}`) &&
      !inLoginForm(target);
    return plain && !target.readOnly && !target.disabled ? target : null;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    const host = editingHost(target);
    return host.closest(CODE_EDITORS) || host.getAttribute('spellcheck') === 'false' ? null : host;
  }
  return null;
}

/** A search box or a login is not prose: left alone, as Grammarly does. */
const SEARCH = /search|query|combobox|login|user|email/i;

/** A line of a form with a password in it: the login of a sign-in, never checked. */
function inLoginForm(input: HTMLInputElement): boolean {
  return !!input.form?.querySelector('input[type="password"]');
}

/** The outermost element of the editor a node is in. */
function editingHost(element: HTMLElement): HTMLElement {
  let host = element;
  while (host.parentElement?.isContentEditable) {
    host = host.parentElement;
  }
  return host;
}

export function isPlainField(field: TextField): field is HTMLTextAreaElement | HTMLInputElement {
  return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement;
}

export function readField(field: TextField): FieldText {
  if (isPlainField(field)) {
    return { text: field.value, segments: null };
  }
  const segments: Segment[] = [];
  let text = '';
  let lastBlock: Element | null = null;
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof HTMLBRElement) {
      text += '\n';
      continue;
    }
    if (!(node instanceof Text) || !node.data) {
      continue;
    }
    const block = blockOf(node, field);
    // A new paragraph: a line break between, so its words never run into the last ones.
    if (lastBlock && block !== lastBlock && text && !text.endsWith('\n')) {
      text += '\n';
    }
    lastBlock = block;
    segments.push({ node, start: text.length });
    text += node.data;
  }
  return { text, segments };
}

function blockOf(node: Node, root: HTMLElement): Element {
  let element = node.parentElement;
  while (element && element !== root && !BLOCKS.has(element.tagName)) {
    element = element.parentElement;
  }
  return element ?? root;
}

/** The text nodes and offsets of a stretch of the text of a rich editor; null — not there. */
export function domRange(segments: Segment[], start: number, end: number): Range | null {
  const from = pointAt(segments, start, false);
  const to = pointAt(segments, end, true);
  if (!from || !to) {
    return null;
  }
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

function pointAt(
  segments: Segment[],
  at: number,
  isEnd: boolean,
): { node: Text; offset: number } | null {
  for (const { node, start } of segments) {
    const end = start + node.data.length;
    if (at >= start && (isEnd ? at <= end : at < end)) {
      return { node, offset: at - start };
    }
  }
  return null;
}

/** Where the caret is in the text of the field; null — not in it. */
export function caretOffset(field: TextField, read: FieldText): number | null {
  if (isPlainField(field)) {
    return field.selectionStart;
  }
  const selection = document.getSelection();
  const node = selection?.focusNode;
  const segment = read.segments?.find((one) => one.node === node);
  return segment && selection ? segment.start + selection.focusOffset : null;
}
