import type { WritingCheckResult, WritingIssue, WritingRewriteMode } from '@pd/contracts';
import { ask, WritingState } from '../../shared/messages';
import { rectsOf, visibleBox } from './field-rects';
import {
  caretOffset,
  checkableField,
  domRange,
  FieldText,
  isPlainField,
  readField,
  TextField,
} from './field-text';
import {
  cardShown,
  drawBadge,
  drawMarks,
  hideAll,
  hideCard,
  showBusy,
  showError,
  showIssueCard,
  showProposal,
  showRewriteMenu,
} from './writing-ui';

/*
 * Writing in the fields of a page, as Grammarly does: the text of the field being typed in is
 * checked by the dashboard after a pause, the mistakes are underlined, a click on a marked word
 * opens its card, and the badge of the field offers the AI's rewrites. A fix is typed into the
 * field the way the person would (so the page sees it, and Ctrl+Z takes it back).
 */

/** A pause in typing this long and the text is checked. */
const CHECK_AFTER_MS = 900;
/** Shorter texts are not worth a check. */
const MIN_LENGTH = 3;
const t = (key: string) => chrome.i18n.getMessage(key) || key;

let state: Promise<WritingState> | null = null;
let field: TextField | null = null;
let read: FieldText = { text: '', segments: null };
let issues: WritingIssue[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let checkNumber = 0;
let frame = 0;

export function setupWriting(): void {
  document.addEventListener('focusin', (event) => void onFocus(event.target), true);
  document.addEventListener('focusout', () => setTimeout(onFocusLeft, 200), true);
  document.addEventListener(
    'input',
    (event) => {
      // Only what the person types: a page's own changes of a field are not theirs to check.
      if (field && event.isTrusted && field.contains(event.target as Node)) {
        changed();
      }
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      // A click in a card of ours is the card's; one in the field may open a mistake's card.
      if (field && (event.target as Element | null)?.tagName !== 'PD-WRITING') {
        setTimeout(openAtCaret, 0);
      }
    },
    true,
  );
  document.addEventListener(
    'keyup',
    (event) => {
      if (event.key === 'Escape') {
        hideCard();
      } else if (field && event.key.startsWith('Arrow')) {
        openAtCaret();
      }
    },
    true,
  );
  window.addEventListener('scroll', redraw, true);
  window.addEventListener('resize', redraw);
}

async function onFocus(target: EventTarget | null): Promise<void> {
  const next = checkableField(target);
  if (!next || next === field) {
    return;
  }
  // Asked once a page: the settings and the site decide.
  state ??= ask<WritingState>({ type: 'writing-state' }).catch(() => ({
    check: false,
    rewrite: false,
  }));
  if (!(await state).check) {
    return;
  }
  field = next;
  issues = [];
  void check();
}

function onFocusLeft(): void {
  if (field && !field.contains(document.activeElement) && document.activeElement !== field) {
    field = null;
    issues = [];
    hideAll();
  }
}

function changed(): void {
  // The marks are stale the moment the text changes: gone until the next answer.
  issues = [];
  hideCard();
  redraw();
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => void check(), CHECK_AFTER_MS);
}

async function check(): Promise<void> {
  const current = field;
  if (!current) {
    return;
  }
  const text = readField(current).text;
  const number = ++checkNumber;
  if (text.trim().length < MIN_LENGTH) {
    issues = [];
    redraw();
    return;
  }
  const result = await ask<WritingCheckResult>({ type: 'writing-check', text }).catch(() => null);
  // Only the answer to the latest check, about the text as it still is, counts.
  if (number !== checkNumber || current !== field || readField(current).text !== text) {
    return;
  }
  issues = result?.issues ?? [];
  redraw();
}

/** The marks and the badge where the field is now (after a scroll, a resize, an answer). */
function redraw(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    if (!field?.isConnected) {
      hideAll();
      return;
    }
    read = readField(field);
    const box = visibleBox(field);
    const rects = rectsOf(
      field,
      read,
      issues.map((issue) => ({ start: issue.offset, end: issue.offset + issue.length })),
    );
    drawMarks(
      issues.map((issue, index) => ({ issue, rects: rects[index] })),
      box,
    );
    if (read.text.trim().length >= MIN_LENGTH) {
      drawBadge(box, issues.length, openRewriteMenu);
    }
  });
}

/** The caret is in a marked word: its card. */
function openAtCaret(): void {
  if (!field || !issues.length) {
    return;
  }
  read = readField(field);
  const caret = caretOffset(field, read);
  const issue =
    caret === null
      ? undefined
      : issues.find((one) => caret >= one.offset && caret <= one.offset + one.length);
  if (!issue) {
    if (cardShown()) hideCard();
    return;
  }
  const [rects] = rectsOf(field, read, [{ start: issue.offset, end: issue.offset + issue.length }]);
  const at = rects[0] ?? visibleBox(field);
  const word = read.text.slice(issue.offset, issue.offset + issue.length);
  showIssueCard(issue, word, at, {
    fix: (replacement) => {
      hideCard();
      replace(issue.offset, issue.offset + issue.length, replacement);
    },
    addWord: () => void ignore({ word }),
    neverShow: () => void ignore({ ruleId: issue.ruleId }),
  });
}

function openRewriteMenu(): void {
  if (!field) {
    return;
  }
  const box = badgeBox(field);
  showRewriteMenu(box, issues.length, (mode) => void rewrite(mode));
}

async function rewrite(mode: WritingRewriteMode): Promise<void> {
  const current = field;
  if (!current) {
    return;
  }
  const box = badgeBox(current);
  const text = readField(current).text;
  showBusy(box);
  try {
    const proposal = await ask<string>({ type: 'writing-rewrite', text, mode });
    showProposal(box, proposal, () => {
      hideCard();
      if (field === current && readField(current).text === text) {
        replace(0, text.length, proposal);
      }
    });
  } catch {
    showError(box, t('writingRewriteFailed'));
  }
}

async function ignore(what: { word?: string; ruleId?: string }): Promise<void> {
  hideCard();
  await ask({ type: 'writing-ignore', ...what }).catch(() => undefined);
  void check();
}

/**
 * Types the replacement over a stretch of the text, as a person would: selected, then
 * `insertText` — the page's editor sees an ordinary input, and Ctrl+Z undoes it.
 */
function replace(start: number, end: number, text: string): void {
  if (!field) {
    return;
  }
  field.focus();
  if (isPlainField(field)) {
    field.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      field.setRangeText(text, start, end, 'end');
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    }
  } else {
    const range = read.segments ? domRange(read.segments, start, end) : null;
    if (!range) {
      return;
    }
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.execCommand('insertText', false, text);
  }
  changed();
}

/** Where the cards of the badge open: the corner of the field. */
function badgeBox(current: TextField): DOMRect {
  const box = visibleBox(current);
  return new DOMRect(box.right - 320, box.bottom - 4, 0, 0);
}
