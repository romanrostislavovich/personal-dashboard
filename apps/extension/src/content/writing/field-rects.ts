import {domRange, FieldText, isPlainField, TextField} from './field-text';

/*
 * Where a stretch of the text is on the screen. A rich editor's text is in the page: a range
 * of its nodes tells. A textarea's text is not reachable this way, so it is laid out again in an
 * invisible copy of the field — the same box, font and wrapping, scrolled the same — and
 * measured there.
 */

/** What makes the text of a textarea wrap and sit where it does. */
const COPIED = [
  'boxSizing',
  'width',
  'height',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontFeatureSettings',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'tabSize',
  'direction',
] as const;

let mirror: HTMLDivElement | null = null;

/** The rectangles (on the screen) of each stretch; an empty list — not visible. */
export function rectsOf(
  field: TextField,
  read: FieldText,
  stretches: {start: number; end: number}[],
): DOMRect[][] {
  if (!isPlainField(field)) {
    return stretches.map(({start, end}) => {
      const range = read.segments ? domRange(read.segments, start, end) : null;
      return range ? [...range.getClientRects()] : [];
    });
  }
  const copy = layOut(field);
  const node = copy.firstChild as Text | null;
  const result = stretches.map(({start, end}) => {
    if (!node || end > node.data.length) {
      return [];
    }
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return [...range.getClientRects()];
  });
  return result;
}

/** The invisible copy of a textarea or an input, over it, with its text and scroll. */
function layOut(field: HTMLTextAreaElement | HTMLInputElement): HTMLDivElement {
  if (!mirror?.isConnected) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    document.documentElement.append(mirror);
  }
  const style = getComputedStyle(field);
  const rect = field.getBoundingClientRect();
  for (const property of COPIED) {
    mirror.style[property] = style[property];
  }
  Object.assign(mirror.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    margin: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    overflowX: 'hidden',
    // A scrollbar narrows the lines: the copy gets one too, or it would wrap differently.
    overflowY: field.scrollHeight > field.clientHeight ? 'scroll' : 'hidden',
    borderColor: 'transparent',
    // A textarea wraps; an input is one line that scrolls sideways.
    whiteSpace: field instanceof HTMLTextAreaElement ? 'pre-wrap' : 'pre',
    overflowWrap:
      field instanceof HTMLTextAreaElement ? 'break-word' : 'normal',
    zIndex: '-1',
  });
  mirror.textContent = field.value;
  mirror.scrollTop = field.scrollTop;
  mirror.scrollLeft = field.scrollLeft;
  return mirror;
}

/** The part of the screen the field shows its text in: marks outside it are not drawn. */
export function visibleBox(field: TextField): DOMRect {
  return field.getBoundingClientRect();
}
