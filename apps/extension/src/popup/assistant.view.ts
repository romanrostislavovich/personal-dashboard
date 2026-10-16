import type { AccessTokenCreated, McpInfo } from '@pd/contracts';
import { ask } from '../shared/messages';
import { field, h, iconButton, t } from './dom';
import type { Popup } from './popup';

type Settings = { currentPage: boolean; pageText: boolean; openTabs: boolean; openUrl: boolean };

/**
 * The assistant and Claude: what this browser offers the dashboard's assistant and the outside
 * AI clients while it is online (each switched on or off), and the access tokens those clients
 * connect with (MCP) — made, shown once, revoked.
 */
export async function assistantView(popup: Popup, back: () => void): Promise<HTMLElement> {
  const state = await ask<{ online: boolean; settings: Settings }>({ type: 'assistant-state' });
  const info = await ask<McpInfo>({ type: 'mcp-info' }).catch(() => null);

  const toggle = (key: keyof Settings) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = state.settings[key];
    input.addEventListener('change', () => {
      void ask({ type: 'assistant-settings', update: { [key]: input.checked } });
    });
    return h('label', { class: 'toggle' }, input, h('span', { text: t(`assistantTool_${key}`) }));
  };

  const tokens = h('div', { class: 'list' });
  const fresh = h('div');
  const drawTokens = (current: McpInfo | null) =>
    tokens.replaceChildren(
      ...(current?.tokens ?? []).map((token) =>
        h(
          'div',
          { class: 'item' },
          h(
            'div',
            { class: 'what' },
            h('div', { class: 'title', text: token.name }),
            h('div', {
              class: 'sub',
              text: `${token.hint}… · ${t(token.scope === 'write' ? 'mcpScopeWrite' : 'mcpScopeRead')}`,
            }),
          ),
          h('button', {
            class: 'button text small',
            type: 'button',
            text: t('mcpRevoke'),
            onClick: () =>
              void ask({ type: 'mcp-revoke', id: token.id })
                .then(() => ask<McpInfo>({ type: 'mcp-info' }))
                .then(drawTokens),
          }),
        ),
      ),
      ...(current?.tokens.length ? [] : [h('p', { class: 'hint', text: t('mcpNoTokens') })]),
    );
  drawTokens(info);

  const name = h('input', { type: 'text', placeholder: t('mcpNamePlaceholder') });
  const scope = h(
    'select',
    {},
    h('option', { attrs: { value: 'read' }, text: t('mcpScopeRead') }),
    h('option', { attrs: { value: 'write' }, text: t('mcpScopeWrite') }),
  );
  const create = h(
    'form',
    {
      class: 'form',
      onSubmit: (event) => {
        event.preventDefault();
        if (!name.value.trim()) {
          return;
        }
        void ask<AccessTokenCreated>({
          type: 'mcp-create',
          name: name.value.trim(),
          scope: scope.value === 'write' ? 'write' : 'read',
        }).then(async (made) => {
          name.value = '';
          fresh.replaceChildren(
            h('p', { class: 'hint', text: t('mcpOnce') }),
            h(
              'div',
              { class: 'secret' },
              h('code', { text: made.token }),
              iconButton('copy', t('copy'), () => {
                void navigator.clipboard.writeText(made.token);
                popup.toast(t('copied'));
              }),
            ),
          );
          drawTokens(await ask<McpInfo>({ type: 'mcp-info' }));
        });
      },
    },
    field(t('mcpName'), name),
    h('label', { class: 'field' }, h('span', { text: t('mcpScope') }), scope),
    h('button', { class: 'button', type: 'submit', text: t('mcpCreate') }),
  );

  return h(
    'section',
    { class: 'view' },
    h(
      'div',
      { class: 'heading' },
      iconButton('back', t('back'), back),
      h('h1', { text: t('assistant') }),
    ),
    h('p', { class: 'hint', text: t(state.online ? 'assistantOnline' : 'assistantOffline') }),
    h('button', {
      class: 'button filled',
      type: 'button',
      text: t('assistantPanel'),
      // Opened from the popup's click: the side panel needs the user's gesture.
      onClick: () =>
        void chrome.windows.getCurrent().then(async (current) => {
          if (current.id !== undefined) {
            await chrome.sidePanel.open({ windowId: current.id });
            window.close();
          }
        }),
    }),
    toggle('currentPage'),
    toggle('pageText'),
    toggle('openTabs'),
    toggle('openUrl'),
    h('h2', { text: t('mcpTitle') }),
    h('p', { class: 'hint', text: t('mcpHint') }),
    info ? h('div', { class: 'secret' }, h('code', { text: info.url })) : null,
    fresh,
    create,
    tokens,
    h('button', {
      class: 'button text',
      type: 'button',
      text: t('mcpHowTo'),
      onClick: () => popup.openDashboard('/settings'),
    }),
  );
}
