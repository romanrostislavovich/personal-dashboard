import type {
  WritingCheckResult,
  WritingIssue,
  WritingRewriteMode,
} from '@pd/contracts';
import {ask, WritingState} from '../../shared/messages';
import {rectsOf, visibleBox} from './field-rects';
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
  BadgeStatus,
  cardShown,
  drawBadge,
  drawMarks,
  hideAll,
  hideCard,
  panelShown,
  showBusy,
  showError,
  showIssueCard,
  showPanel,
  showProposal,
} from './writing-ui';

/*
 * Writing in the fields of a page, as Grammarly does: a field that gets the focus gets the badge
 * in its corner, its text is checked by the dashboard after a pause, the mistakes are
 * underlined, a click on a marked word opens its card, and the badge opens the panel of the
 * field — the mistakes in a list, "fix all", the AI's rewrites, "not on this site". A fix is
 * typed into the field the way the person would (so the page sees it, and Ctrl+Z takes it back).
 */

/** A pause in typing this long and the text is checked. */
const CHECK_AFTER_MS = 900;
/** Shorter texts are not worth a check. */
const MIN_LENGTH = 3;
/** Whether to check is asked again after this long (the settings may have changed). */
const STATE_TTL_MS = 60_000;
const t = (key: string) => chrome.i18n.getMessage(key) || key;
const OFF: WritingState = {check: false, rewrite: false};

let state: {value: WritingState; at: number} | null = null;
let field: TextField | null = null;
let read: FieldText = {text: '', segments: null};
let issues: WritingIssue[] = [];
/** The text is with the server; and whether `issues` are of a finished check of the text. */
let checking = false;
let checked = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let checkNumber = 0;
let frame = 0;

/** The settings were changed (the popup, the badge's "not here"): asked again at once. */
export function resetWriting(): void {
  state = null;
  const current = field;
  field = null;
  issues = [];
  hideAll();
  if (current?.isConnected) {
    void onFocus(current);
  }
}

/** Whether to check on this page; a failed answer is not kept (the worker may have slept). */
async function writingState(): Promise<WritingState> {
  if (state && Date.now() - state.at < STATE_TTL_MS) {
    return state.value;
  }
  try {
    const value = await ask<WritingState>({type: 'writing-state'});
    state = {value, at: Date.now()};
    return value;
  } catch {
    return OFF;
  }
}

export function setupWriting(): void {
  document.addEventListener(
    'focusin',
    event => void onFocus(event.target),
    true,
  );
  document.addEventListener(
    'focusout',
    () => setTimeout(onFocusLeft, 200),
    true,
  );
  document.addEventListener(
    'input',
    event => {
      // Only what the person types: a page's own changes of a field are not theirs to check.
      if (field && event.isTrusted && field.contains(event.target as Node)) {
        changed();
      }
    },
    true,
  );
  document.addEventListener(
    'click',
    event => {
      // A click in a card of ours is the card's; one in the field may open a mistake's card.
      if (field && (event.target as Element | null)?.tagName !== 'PD-WRITING') {
        setTimeout(openAtCaret, 0);
      }
    },
    true,
  );
  document.addEventListener(
    'keyup',
    event => {
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
  // The settings and the site decide.
  if (!(await writingState()).check || !next.isConnected) {
    return;
  }
  field = next;
  issues = [];
  checked = false;
  // The badge at once, before anything is typed: the person sees the field is checked.
  redraw();
  void check();
}

function onFocusLeft(): void {
  if (
    field &&
    !field.contains(document.activeElement) &&
    document.activeElement !== field
  ) {
    field = null;
    issues = [];
    hideAll();
  }
}

function changed(): void {
  // The marks are stale the moment the text changes: gone until the next answer.
  issues = [];
  checked = false;
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
    checking = false;
    redraw();
    return;
  }
  checking = true;
  redraw();
  const result = await ask<WritingCheckResult>({
    type: 'writing-check',
    text,
  }).catch(() => null);
  // Only the answer to the latest check, about the text as it still is, counts.
  if (
    number !== checkNumber ||
    current !== field ||
    readField(current).text !== text
  ) {
    return;
  }
  checking = false;
  checked = !!result;
  issues = result?.issues ?? [];
  redraw();
  // The panel opened while the text was with the server: now it has the answer.
  if (panelShown()) {
    void openPanel();
  }
}

function badgeStatus(): BadgeStatus {
  if (checking) {
    return 'checking';
  }
  if (read.text.trim().length < MIN_LENGTH || !checked) {
    return 'idle';
  }
  return issues.length ? 'issues' : 'clean';
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
      issues.map(issue => ({
        start: issue.offset,
        end: issue.offset + issue.length,
      })),
    );
    drawMarks(
      issues.map((issue, index) => ({issue, rects: rects[index]})),
      box,
    );
    drawBadge(box, badgeStatus(), issues.length, openPanel);
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
      : issues.find(
          one => caret >= one.offset && caret <= one.offset + one.length,
        );
  if (!issue) {
    if (cardShown()) hideCard();
    return;
  }
  openIssue(issue);
}

/** The card of a mistake, under its word. */
function openIssue(issue: WritingIssue): void {
  if (!field) {
    return;
  }
  read = readField(field);
  const [rects] = rectsOf(field, read, [
    {start: issue.offset, end: issue.offset + issue.length},
  ]);
  const at = rects[0] ?? visibleBox(field);
  const word = read.text.slice(issue.offset, issue.offset + issue.length);
  showIssueCard(issue, word, at, {
    fix: replacement => {
      hideCard();
      replace(issue.offset, issue.offset + issue.length, replacement);
      accepted(1);
    },
    addWord: () => void ignore({word}),
    neverShow: () => void ignore({ruleId: issue.ruleId}),
  });
}

/** The badge was clicked: the panel of the field. */
async function openPanel(): Promise<void> {
  const current = field;
  if (!current) {
    return;
  }
  const {rewrite: canRewrite} = await writingState();
  if (field !== current) {
    return;
  }
  read = readField(current);
  const fixable = issues.filter(issue => issue.replacements.length);
  showPanel(
    badgeBox(current),
    badgeStatus(),
    issues.map(issue => ({
      issue,
      word: read.text.slice(issue.offset, issue.offset + issue.length),
    })),
    {
      open: issue => {
        hideCard();
        openIssue(issue);
      },
      fixAll: fixable.length > 1 ? () => fixAll(fixable) : null,
      rewrite:
        canRewrite && read.text.trim().length >= MIN_LENGTH
          ? mode => void rewrite(mode)
          : null,
      offHere: () => void offHere(),
      settings: () => {
        hideCard();
        void ask({type: 'writing-settings'}).catch(() => undefined);
      },
    },
  );
}

/**
 * Every mistake fixed with its first suggestion, from the end of the text so the offsets of
 * the rest still hold; it stops if the page changes the text meanwhile.
 */
function fixAll(fixable: WritingIssue[]): void {
  hideCard();
  if (!field) {
    return;
  }
  let expected = readField(field).text;
  let before = Infinity;
  let fixed = 0;
  for (const issue of [...fixable].sort((a, b) => b.offset - a.offset)) {
    const end = issue.offset + issue.length;
    // Two suggestions for one stretch: the first one taken is enough.
    if (end > before) {
      continue;
    }
    if (!field || readField(field).text !== expected) {
      break;
    }
    const replacement = issue.replacements[0];
    expected =
      expected.slice(0, issue.offset) + replacement + expected.slice(end);
    read = readField(field);
    replace(issue.offset, end, replacement);
    before = issue.offset;
    fixed++;
  }
  accepted(fixed);
}

/** "Not on this site": the dashboard remembers it; the marks go at once. */
async function offHere(): Promise<void> {
  const current = field;
  if (!current) {
    return;
  }
  try {
    await ask({type: 'writing-off-here'});
  } catch {
    // Not kept (no connection, or an address that is not a site): the field stays checked.
    showError(badgeBox(current), t('writingOffFailed'));
    return;
  }
  hideAll();
  field = null;
  issues = [];
  state = {value: OFF, at: Date.now()};
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
    const proposal = await ask<string>({type: 'writing-rewrite', text, mode});
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

/** Fixes taken are counted for the achievements; nothing waits for it. */
function accepted(count: number): void {
  if (count > 0) {
    void ask({type: 'writing-accepted', count}).catch(() => undefined);
  }
}

async function ignore(what: {word?: string; ruleId?: string}): Promise<void> {
  hideCard();
  await ask({type: 'writing-ignore', ...what}).catch(() => undefined);
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
      field.dispatchEvent(
        new InputEvent('input', {bubbles: true, inputType: 'insertText'}),
      );
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
