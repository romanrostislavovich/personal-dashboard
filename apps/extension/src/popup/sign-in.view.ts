import { ask, SignInResult } from '../shared/messages';
import { field, h, t } from './dom';
import type { Popup } from './popup';

/** Signing in to the dashboard: its address and the account, then a code if two-factor is on. */
export function signInView(popup: Popup): HTMLElement {
  const server = h('input', {
    type: 'url',
    value: popup.state.server ?? '',
    placeholder: 'https://dash.example.com',
    required: true,
    autofocus: !popup.state.server,
  });
  const email = h('input', {
    type: 'email',
    autocomplete: 'username',
    required: true,
    autofocus: !!popup.state.server,
  });
  const password = h('input', {
    type: 'password',
    autocomplete: 'current-password',
    required: true,
  });
  const error = h('p', { class: 'error' });
  const submit = h('button', { class: 'button filled', type: 'submit', text: t('signIn') });

  const form = h(
    'form',
    {
      class: 'view',
      onSubmit: (event) => {
        event.preventDefault();
        void busy(
          submit,
          error,
          async () => {
            const result = await ask<SignInResult>({
              type: 'sign-in',
              server: server.value,
              email: email.value,
              password: password.value,
            });
            if (result.status === 'code-required') {
              popup.show(codeView(popup, result.challengeToken));
            } else {
              await popup.reload();
            }
          },
          popup,
        );
      },
    },
    h('h1', { text: t('signInTitle') }),
    h('p', { class: 'hint', text: t('signInHint') }),
    field(t('server'), server),
    field(t('email'), email),
    field(t('password'), password),
    error,
    submit,
  );
  return form;
}

function codeView(popup: Popup, challengeToken: string): HTMLElement {
  const code = h('input', {
    type: 'text',
    autocomplete: 'one-time-code',
    required: true,
    autofocus: true,
  });
  const error = h('p', { class: 'error' });
  const submit = h('button', { class: 'button filled', type: 'submit', text: t('signIn') });
  return h(
    'form',
    {
      class: 'view',
      onSubmit: (event) => {
        event.preventDefault();
        void busy(
          submit,
          error,
          async () => {
            await ask({ type: 'sign-in-code', challengeToken, code: code.value });
            await popup.reload();
          },
          popup,
        );
      },
    },
    h('h1', { text: t('codeTitle') }),
    h('p', { class: 'hint', text: t('codeHint') }),
    field(t('code'), code),
    error,
    submit,
  );
}

/** Runs `work` with the button disabled; an error goes into `error`. */
export async function busy(
  button: HTMLButtonElement,
  error: HTMLElement,
  work: () => Promise<void>,
  popup: Popup,
): Promise<void> {
  button.disabled = true;
  error.textContent = '';
  try {
    await work();
  } catch (failure) {
    error.textContent = popup.errorText(failure);
  } finally {
    button.disabled = false;
  }
}
