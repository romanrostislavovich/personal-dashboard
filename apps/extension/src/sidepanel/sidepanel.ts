import type { AiChatResponse, AiConversationDetail } from '@pd/contracts';
import { ask } from '../shared/messages';
import { h, t } from '../popup/dom';

/*
 * The dashboard's assistant beside the page (Chrome's side panel): the same conversation as in
 * the dashboard and in Telegram, so it goes on wherever it was left. The assistant sees this
 * browser through its device tools — the page in front, the selection, the tabs — as far as
 * they are switched on in the popup; a few buttons ask the usual questions about the page.
 */

interface Line {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
}

const QUICK = ['sidepanelQuickSummary', 'sidepanelQuickTask', 'sidepanelQuickExplain'];

const app = document.getElementById('app') as HTMLElement;
const lines: Line[] = [];
let conversationId: string | undefined;
let busy = false;
let confirming = false;

const list = h('div', { class: 'messages', attrs: { 'aria-live': 'polite' } });
const input = h('textarea', { attrs: { placeholder: t('sidepanelPlaceholder'), rows: '2' } });
const send = h('button', { class: 'primary', type: 'submit', text: t('sidepanelSend') });
const quick = h('div', { class: 'quick' });

void start();

async function start(): Promise<void> {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void say(input.value);
    }
  });
  app.replaceChildren(
    h(
      'header',
      {},
      h('h1', { text: t('assistant') }),
      h('button', { type: 'button', text: t('sidepanelNew'), onClick: () => void fresh() }),
    ),
    list,
    quick,
    h(
      'form',
      {
        onSubmit: (event) => {
          event.preventDefault();
          void say(input.value);
        },
      },
      input,
      send,
    ),
  );
  try {
    const current = await ask<AiConversationDetail | null>({ type: 'chat-current' });
    conversationId = current?.id;
    for (const message of current?.messages.slice(-30) ?? []) {
      lines.push({ role: message.role, content: message.content, toolsUsed: message.toolsUsed });
    }
  } catch {
    lines.push({ role: 'assistant', content: t('sidepanelSignIn') });
  }
  draw();
}

async function fresh(): Promise<void> {
  const started = await ask<AiConversationDetail>({ type: 'chat-new' }).catch(() => null);
  conversationId = started?.id;
  lines.length = 0;
  confirming = false;
  draw();
}

async function say(text: string): Promise<void> {
  const content = text.trim();
  if (!content || busy) {
    return;
  }
  input.value = '';
  lines.push({ role: 'user', content });
  busy = true;
  confirming = false;
  draw();
  try {
    const answer = await ask<AiChatResponse>({ type: 'chat-send', content, conversationId });
    conversationId = answer.conversationId;
    lines.push({ role: 'assistant', content: answer.reply, toolsUsed: answer.toolsUsed });
    confirming = answer.awaitsConfirmation === true;
  } catch {
    lines.push({ role: 'assistant', content: t('sidepanelFailed') });
  } finally {
    busy = false;
    draw();
  }
}

function draw(): void {
  list.replaceChildren(
    ...(lines.length ? [] : [h('p', { class: 'hint', text: t('sidepanelEmpty') })]),
    ...lines.map((line) =>
      h(
        'div',
        { class: `message ${line.role}` },
        h('div', { text: line.content }),
        line.toolsUsed?.length
          ? h('div', { class: 'used', text: `${t('sidepanelUsed')}: ${line.toolsUsed.join(', ')}` })
          : null,
      ),
    ),
    ...(busy ? [h('div', { class: 'message assistant', text: t('sidepanelThinking') })] : []),
  );
  list.scrollTop = list.scrollHeight;
  // A question to confirm (a deletion) gets "Yes" and "No"; otherwise the usual questions.
  quick.replaceChildren(
    ...(confirming
      ? [
          h('button', {
            class: 'primary',
            type: 'button',
            text: t('sidepanelYes'),
            onClick: () => void say(t('sidepanelYes')),
          }),
          h('button', {
            type: 'button',
            text: t('sidepanelNo'),
            onClick: () => void say(t('sidepanelNo')),
          }),
        ]
      : QUICK.map((key) =>
          h('button', {
            type: 'button',
            text: t(key),
            disabled: busy,
            onClick: () => void say(t(`${key}Prompt`)),
          }),
        )),
  );
  send.disabled = busy;
}
