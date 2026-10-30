import {pastedFiles} from '@pd/client-core';
import {
  AI_ATTACHMENT_EXTENSIONS,
  AI_IMAGE_EXTENSIONS,
  AI_MAX_ATTACHMENTS,
  type AiAttachment,
  type AiChatResponse,
  type AiConversationDetail,
} from '@pd/contracts';
import {ask, type ChatAttachResult} from '../shared/messages';
import {h, t} from '../popup/dom';
import {workstateView} from './workstate.view';

/*
 * The dashboard's assistant beside the page (Chrome's side panel): the same conversation as in
 * the dashboard and in Telegram, so it goes on wherever it was left. The assistant sees this
 * browser through its device tools — the page in front, the selection, the tabs — as far as
 * they are switched on in the popup; a few buttons ask the usual questions about the page.
 * A screenshot pasted with Ctrl+V (or a file from the clip button) goes with the next message.
 */

interface Line {
  role: 'user' | 'assistant';
  content: string;
  attachments?: string[];
  toolsUsed?: string[];
}

type AttachFailure = Extract<ChatAttachResult, {failure: string}>['failure'];

const QUICK = [
  'sidepanelQuickSummary',
  'sidepanelQuickTask',
  'sidepanelQuickExplain',
];

const app = document.getElementById('app') as HTMLElement;
const lines: Line[] = [];
let conversationId: string | undefined;
let busy = false;
let confirming = false;
/** Files the server has read, waiting for the next message. */
let attachments: AiAttachment[] = [];
let uploading = false;
let attachNote = '';

const list = h('div', {class: 'messages', attrs: {'aria-live': 'polite'}});
const input = h('textarea', {
  attrs: {placeholder: t('sidepanelPlaceholder'), rows: '2'},
});
const send = h('button', {
  class: 'primary',
  type: 'submit',
  text: t('sidepanelSend'),
});
const quick = h('div', {class: 'quick'});
const attached = h('div', {class: 'attached'});
const picker = h('input', {
  type: 'file',
  attrs: {
    multiple: '',
    hidden: '',
    accept: [...AI_ATTACHMENT_EXTENSIONS, ...AI_IMAGE_EXTENSIONS].join(','),
  },
});
const clip = h('button', {
  class: 'clip',
  type: 'button',
  text: '📎',
  title: t('sidepanelAttach'),
  attrs: {'aria-label': t('sidepanelAttach')},
  onClick: () => picker.click(),
});

void start();

async function start(): Promise<void> {
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void say(input.value);
    }
  });
  input.addEventListener('paste', event => {
    const files = pastedFiles(event.clipboardData);
    if (files.length) {
      event.preventDefault();
      void attach(files);
    }
  });
  picker.addEventListener('change', () => {
    const files = [...(picker.files ?? [])];
    picker.value = '';
    void attach(files);
  });
  app.replaceChildren(
    h(
      'header',
      {},
      h('h1', {text: t('assistant')}),
      h('button', {
        type: 'button',
        text: t('sidepanelNew'),
        onClick: () => void fresh(),
      }),
    ),
    workstateView(),
    list,
    quick,
    attached,
    h(
      'form',
      {
        onSubmit: event => {
          event.preventDefault();
          void say(input.value);
        },
      },
      clip,
      picker,
      input,
      send,
    ),
  );
  try {
    const current = await ask<AiConversationDetail | null>({
      type: 'chat-current',
    });
    conversationId = current?.id;
    for (const message of current?.messages.slice(-30) ?? []) {
      const {role, content, attachments: files, toolsUsed} = message;
      lines.push({role, content, attachments: files, toolsUsed});
    }
  } catch {
    lines.push({role: 'assistant', content: t('sidepanelSignIn')});
  }
  draw();
}

async function fresh(): Promise<void> {
  const started = await ask<AiConversationDetail>({type: 'chat-new'}).catch(
    () => null,
  );
  conversationId = started?.id;
  lines.length = 0;
  confirming = false;
  draw();
}

/** Has the server read the files one by one (a picture — by the AI that reads pictures). */
async function attach(files: File[]): Promise<void> {
  if (uploading) {
    return;
  }
  uploading = true;
  attachNote = '';
  draw();
  try {
    for (const file of files.slice(
      0,
      AI_MAX_ATTACHMENTS - attachments.length,
    )) {
      const result = await ask<ChatAttachResult>({
        type: 'chat-attach',
        name: file.name,
        mimeType: file.type,
        base64: await base64Of(file),
      }).catch((): ChatAttachResult => ({failure: 'failed'}));
      if ('attachment' in result) {
        const {name, text, truncated} = result.attachment;
        attachments = [...attachments, {name, text}];
        attachNote = truncated ? t('sidepanelAttachTruncated', name) : '';
      } else {
        attachNote = failureText(result.failure, file.name);
      }
      draw();
    }
  } finally {
    uploading = false;
    draw();
  }
}

function failureText(failure: AttachFailure, name: string): string {
  switch (failure) {
    case 'unsupported':
      return t('sidepanelAttachUnsupported', name);
    case 'empty':
      return t('sidepanelAttachEmpty', name);
    case 'no-vision':
      return t('sidepanelAttachNoVision', name);
    case 'too-large':
      return t('sidepanelAttachTooLarge', name);
    default:
      return t('sidepanelAttachFailed', name);
  }
}

/** A message between the parts of the extension carries only JSON: the bytes go as base64. */
async function base64Of(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  // In parts: spreading megabytes into one call overflows the stack.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

async function say(text: string): Promise<void> {
  const content = text.trim();
  const files = attachments;
  if ((!content && !files.length) || busy || uploading) {
    return;
  }
  input.value = '';
  attachments = [];
  attachNote = '';
  lines.push({
    role: 'user',
    content,
    attachments: files.map(file => file.name),
  });
  busy = true;
  confirming = false;
  draw();
  try {
    const answer = await ask<AiChatResponse>({
      type: 'chat-send',
      content,
      conversationId,
      ...(files.length ? {attachments: files} : {}),
    });
    conversationId = answer.conversationId;
    lines.push({
      role: 'assistant',
      content: answer.reply,
      toolsUsed: answer.toolsUsed,
    });
    confirming = answer.awaitsConfirmation === true;
  } catch {
    lines.push({role: 'assistant', content: t('sidepanelFailed')});
  } finally {
    busy = false;
    draw();
  }
}

function draw(): void {
  list.replaceChildren(
    ...(lines.length
      ? []
      : [h('p', {class: 'hint', text: t('sidepanelEmpty')})]),
    ...lines.map(line =>
      h(
        'div',
        {class: `message ${line.role}`},
        line.content ? h('div', {text: line.content}) : null,
        line.attachments?.length
          ? h('div', {
              class: 'files',
              text: line.attachments.map(name => `📎 ${name}`).join('  '),
            })
          : null,
        line.toolsUsed?.length
          ? h('div', {
              class: 'used',
              text: `${t('sidepanelUsed')}: ${line.toolsUsed.join(', ')}`,
            })
          : null,
      ),
    ),
    ...(busy
      ? [h('div', {class: 'message assistant', text: t('sidepanelThinking')})]
      : []),
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
      : QUICK.map(key =>
          h('button', {
            type: 'button',
            text: t(key),
            disabled: busy,
            onClick: () => void say(t(`${key}Prompt`)),
          }),
        )),
  );
  drawAttached();
  send.disabled = busy || uploading;
  clip.disabled = uploading || attachments.length >= AI_MAX_ATTACHMENTS;
}

/** The files for the next message, above the field, each with a button to drop it. */
function drawAttached(): void {
  attached.replaceChildren(
    ...attachments.map((file, index) =>
      h(
        'span',
        {class: 'chip'},
        `📎 ${file.name}`,
        h('button', {
          type: 'button',
          text: '×',
          title: t('sidepanelAttachRemove'),
          attrs: {'aria-label': t('sidepanelAttachRemove')},
          onClick: () => {
            attachments = attachments.filter((_, i) => i !== index);
            draw();
          },
        }),
      ),
    ),
    ...(uploading
      ? [h('span', {class: 'note', text: t('sidepanelAttachReading')})]
      : []),
    ...(attachNote ? [h('span', {class: 'note', text: attachNote})] : []),
  );
}
