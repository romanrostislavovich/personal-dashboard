import type { WritingIssue, WritingRewriteMode } from '@pd/contracts';

/** As WRITING_REWRITE_MODES of contracts: a type only, or zod would come into every page. */
const MODES: WritingRewriteMode[] = ['fix', 'shorter', 'polite', 'formal', 'friendly'];

/*
 * What Writing draws over a page, in a closed shadow root of its own (the page can neither
 * style nor read it): the marks under the mistakes, the badge of the field with their number,
 * and the card of a mistake or of the AI's version. The marks let every click through: the
 * field stays the page's.
 */

const t = (key: string, ...values: string[]) => chrome.i18n.getMessage(key, values) || key;

const COLOURS: Record<WritingIssue['kind'], string> = {
  spelling: '#e53935',
  grammar: '#f9a825',
  punctuation: '#fb8c00',
  style: '#3f51b5',
  typography: '#9e9e9e',
  other: '#9e9e9e',
};

const STYLE = `
  :host { all: initial; }
  .mark { position: fixed; height: 2px; border-radius: 1px; pointer-events: none; opacity: .85; }
  .badge {
    position: fixed; min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box;
    border: 0; border-radius: 11px; cursor: pointer; font: 600 12px/22px system-ui, sans-serif;
    color: #fff; background: #3f51b5; box-shadow: 0 1px 4px rgba(0,0,0,.3);
  }
  .badge.clean { background: #2e7d32; }
  .card {
    position: fixed; width: 320px; max-height: 360px; overflow: auto; box-sizing: border-box;
    padding: 12px; border-radius: 12px; background: #fbf8ff; color: #1b1b1f;
    box-shadow: 0 4px 16px rgba(0,0,0,.25); font: 14px/1.45 system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    .card { background: #2a292f; color: #e4e1e9; }
    .muted { color: #c6c5d0 !important; }
  }
  .kind { font: 600 12px system-ui, sans-serif; margin-bottom: 4px; }
  .muted { color: #5d5e66; font-size: 13px; margin: 0 0 10px; white-space: pre-wrap; }
  .fixes, .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .actions { margin-top: 10px; }
  button.fix, button.action {
    border: 0; border-radius: 16px; padding: 6px 12px; cursor: pointer;
    font: 500 13px system-ui, sans-serif;
  }
  button.fix { background: #3f51b5; color: #fff; }
  button.action { background: #e0e0ff; color: #1a237e; }
  .proposal { white-space: pre-wrap; margin: 0 0 8px; }
`;

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let layer: HTMLDivElement | null = null;
let badge: HTMLButtonElement | null = null;
let card: HTMLDivElement | null = null;

function shadow(): ShadowRoot {
  if (root && host?.isConnected) {
    return root;
  }
  host = document.createElement('pd-writing');
  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  layer = document.createElement('div');
  root.append(style, layer);
  document.documentElement.append(host);
  return root;
}

/** The marks under the mistakes, only the parts inside the field's box. */
export function drawMarks(marks: { issue: WritingIssue; rects: DOMRect[] }[], box: DOMRect): void {
  shadow();
  const nodes: HTMLDivElement[] = [];
  for (const { issue, rects } of marks) {
    for (const rect of rects) {
      if (rect.bottom < box.top || rect.top > box.bottom || rect.right < box.left) {
        continue;
      }
      const left = Math.max(rect.left, box.left);
      const right = Math.min(rect.right, box.right);
      if (right - left < 2) {
        continue;
      }
      const mark = document.createElement('div');
      mark.className = 'mark';
      Object.assign(mark.style, {
        left: `${left}px`,
        top: `${rect.bottom - 1}px`,
        width: `${right - left}px`,
        background: COLOURS[issue.kind],
      });
      nodes.push(mark);
    }
  }
  layer?.replaceChildren(...nodes);
}

/** The badge in the corner of the field: the number of mistakes; a click opens the AI's menu. */
export function drawBadge(box: DOMRect, count: number, onClick: () => void): void {
  shadow();
  if (!badge) {
    badge = document.createElement('button');
    badge.className = 'badge';
    badge.type = 'button';
    // Pressing it must not take the focus (and the caret) from the field.
    badge.addEventListener('mousedown', (event) => event.preventDefault());
    root?.append(badge);
  }
  badge.onclick = onClick;
  badge.textContent = count ? String(count) : '✓';
  badge.title = t('writingBadge', String(count));
  badge.classList.toggle('clean', count === 0);
  badge.style.left = `${box.right - 28}px`;
  badge.style.top = `${box.bottom - 28}px`;
}

export function hideAll(): void {
  layer?.replaceChildren();
  badge?.remove();
  badge = null;
  hideCard();
}

export function hideCard(): void {
  card?.remove();
  card = null;
}

export function cardShown(): boolean {
  return !!card;
}

export interface IssueActions {
  fix: (replacement: string) => void;
  addWord: () => void;
  neverShow: () => void;
}

/** The card of a mistake, under its word. */
export function showIssueCard(
  issue: WritingIssue,
  word: string,
  at: DOMRect,
  act: IssueActions,
): void {
  const body = openCard(at);
  const kind = element('div', 'kind', t(`writingKind_${issue.kind}`));
  kind.style.color = COLOURS[issue.kind];
  const fixes = element('div', 'fixes');
  for (const replacement of issue.replacements) {
    fixes.append(button('fix', replacement || t('writingRemove'), () => act.fix(replacement)));
  }
  const actions = element('div', 'actions');
  if (issue.kind === 'spelling') {
    actions.append(button('action', t('writingAddWord', word), act.addWord));
  }
  actions.append(button('action', t('writingNeverShow'), act.neverShow));
  body.append(kind, element('p', 'muted', issue.message), fixes, actions);
}

/** The AI's menu of the field: the ways to rewrite the whole text. */
export function showRewriteMenu(
  at: DOMRect,
  count: number,
  rewrite: (mode: WritingRewriteMode) => void,
): void {
  const body = openCard(at);
  body.append(element('p', 'muted', t('writingBadge', String(count))));
  const actions = element('div', 'fixes');
  for (const mode of MODES) {
    actions.append(button('action', t(`writingRewrite_${mode}`), () => rewrite(mode)));
  }
  body.append(actions);
}

export function showBusy(at: DOMRect): void {
  openCard(at).append(element('p', 'muted', t('writingThinking')));
}

/** The AI's version of the text, to put in place of it or not. */
export function showProposal(at: DOMRect, text: string, accept: () => void): void {
  const body = openCard(at);
  const actions = element('div', 'actions');
  actions.append(
    button('fix', t('writingAccept'), accept),
    button('action', t('writingDiscard'), hideCard),
  );
  body.append(element('p', 'proposal', text), actions);
}

export function showError(at: DOMRect, message: string): void {
  openCard(at).append(element('p', 'muted', message));
}

function openCard(at: DOMRect): HTMLDivElement {
  shadow();
  hideCard();
  card = document.createElement('div');
  card.className = 'card';
  card.addEventListener('mousedown', (event) => event.preventDefault());
  const below = at.bottom + 8 + 200 < window.innerHeight;
  card.style.left = `${Math.max(8, Math.min(at.left, window.innerWidth - 328))}px`;
  if (below) {
    card.style.top = `${at.bottom + 6}px`;
  } else {
    card.style.bottom = `${Math.max(8, window.innerHeight - at.top + 6)}px`;
  }
  root?.append(card);
  return card;
}

function element<K extends 'div' | 'p'>(tag: K, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}
