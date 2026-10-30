import {h, t} from '../popup/dom';
import {ask, ExtensionError, type WorkstatePreview} from '../shared/messages';

/** Explicit capture, separate from the assistant's page tools and engagement consent. */
export function workstateView(): HTMLElement {
  const root = h('section', {
    class: 'workstate',
    attrs: {'aria-label': t('workstateTitle')},
  });
  let preview: WorkstatePreview | null = null;
  let busy = false;
  let confirming = false;
  let sequence = 0;
  let note = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  function discard(message = ''): void {
    sequence++;
    clearTimeout(timer);
    preview = null;
    busy = false;
    confirming = false;
    note = message;
    void ask({type: 'workstate-cancel'}).catch(() => undefined);
    draw();
  }

  function gesture(event: MouseEvent): boolean {
    return (
      event.isTrusted &&
      document.visibilityState === 'visible' &&
      document.hasFocus()
    );
  }

  async function prepare(event: MouseEvent): Promise<void> {
    if (!gesture(event) || busy) return;
    const request = ++sequence;
    busy = true;
    note = '';
    draw();
    try {
      const window = await chrome.windows.getCurrent();
      if (request !== sequence || window.id === undefined) return;
      const result = await ask<WorkstatePreview>({
        type: 'workstate-preview',
        windowId: window.id,
      });
      if (request !== sequence) return;
      preview = result;
      timer = setTimeout(
        () => discard(t('workstateExpired')),
        Math.max(0, result.expires - Date.now()),
      );
    } catch (error) {
      if (request === sequence) note = failure(error);
    } finally {
      if (request === sequence) {
        busy = false;
        draw();
      }
    }
  }

  async function save(event: MouseEvent): Promise<void> {
    if (!gesture(event) || busy || !preview) return;
    const id = preview.input.id;
    const request = ++sequence;
    clearTimeout(timer);
    preview = null;
    busy = true;
    confirming = true;
    draw();
    try {
      await ask({type: 'workstate-confirm', id});
      if (request === sequence) note = t('workstateSaved');
    } catch (error) {
      if (request === sequence) note = failure(error);
    } finally {
      if (request === sequence) {
        busy = false;
        confirming = false;
        draw();
      }
    }
  }

  async function open(event: MouseEvent): Promise<void> {
    if (!gesture(event) || busy) return;
    discard();
    try {
      await ask({type: 'workstate-open'});
    } catch (error) {
      note = failure(error);
      draw();
    }
  }

  function draw(): void {
    root.replaceChildren(
      h('h2', {text: t('workstateTitle')}),
      h('p', {class: 'hint', text: t('workstateHint')}),
      ...(preview
        ? [
            h('p', {text: `${t('server')}: ${preview.server}`}),
            h('p', {text: t('workstatePreviewHint')}),
            h('pre', {
              text: JSON.stringify(preview.input, null, 2),
              attrs: {tabindex: '0'},
            }),
          ]
        : []),
      h(
        'div',
        {class: 'workstate-actions'},
        preview
          ? h('button', {
              type: 'button',
              class: 'primary',
              text: t('workstateConfirm'),
              onClick: event => void save(event),
            })
          : h('button', {
              type: 'button',
              text: t('workstatePreview'),
              disabled: busy,
              onClick: event => void prepare(event),
            }),
        preview || (busy && !confirming)
          ? h('button', {
              type: 'button',
              text: t('workstateCancel'),
              onClick: event => {
                if (gesture(event)) discard(t('workstateCanceled'));
              },
            })
          : null,
        h('button', {
          type: 'button',
          text: t('workstateOpen'),
          disabled: busy,
          onClick: event => void open(event),
        }),
      ),
      h('p', {
        class: 'hint',
        text: busy ? t('workstateBusy') : note,
        attrs: {role: 'status'},
      }),
    );
  }

  function invalidate(): void {
    if (preview || (busy && !confirming)) discard(t('workstateExpired'));
  }

  window.addEventListener('blur', invalidate);
  window.addEventListener('pagehide', () => discard());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') invalidate();
  });
  chrome.tabs.onActivated.addListener(invalidate);
  chrome.tabs.onUpdated.addListener((_id, change) => {
    if (change.url !== undefined || change.status === 'loading') invalidate();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      [
        'server',
        'pd.user',
        'pd.refreshToken',
        'telemetryExcluded',
        'neverSave',
        'browserConfig',
      ].some(key => key in changes)
    )
      invalidate();
  });
  draw();
  return root;
}

function failure(error: unknown): string {
  return error instanceof ExtensionError && error.code === 'signed-out'
    ? t('sidepanelSignIn')
    : t('workstateFailed');
}
