import {ask} from '../shared/messages';
import {field, h, iconButton, t} from './dom';
import type {Popup} from './popup';
import {busy} from './sign-in.view';

/**
 * The vault is locked and a login is wanted: the master password opens it. Forgotten — the
 * dashboard has the way back.
 */
export function unlockView(popup: Popup): HTMLElement {
  const master = h('input', {
    type: 'password',
    autocomplete: 'current-password',
    required: true,
    autofocus: true,
  });
  const error = h('p', {class: 'error'});
  const submit = h('button', {
    class: 'button filled',
    type: 'submit',
    text: t('unlock'),
  });
  return h(
    'form',
    {
      class: 'view',
      onSubmit: event => {
        event.preventDefault();
        submit.textContent = t('unlocking');
        void busy(
          submit,
          error,
          async () => {
            await ask({type: 'unlock', masterPassword: master.value});
            await popup.reload();
          },
          popup,
        ).finally(() => {
          submit.textContent = t('unlock');
          master.select();
        });
      },
    },
    h(
      'div',
      {class: 'heading'},
      iconButton('back', t('back'), () => popup.home()),
      h('h1', {text: t('lockedTitle')}),
    ),
    popup.state.offer?.mode === 'locked'
      ? h('p', {class: 'hint', text: t('unlockToSave', popup.state.offer.site)})
      : null,
    field(t('masterPassword'), master),
    error,
    submit,
    h('button', {
      class: 'button text',
      type: 'button',
      text: t('forgotMaster'),
      onClick: () => popup.openDashboard('/vault'),
    }),
  );
}

/** Who is signed in, and signing out. */
export function accountBar(popup: Popup): HTMLElement {
  return h(
    'div',
    {class: 'account'},
    h('span', {class: 'who', text: popup.state.email ?? ''}),
    // The assistant's tools of this browser work without the vault: reached from here too.
    h('button', {
      class: 'button text small',
      type: 'button',
      text: t('assistant'),
      onClick: () => popup.assistant(() => void popup.reload()),
    }),
    iconButton('logout', t('signOut'), () => {
      void ask({type: 'sign-out'}).finally(() => void popup.reload());
    }),
  );
}
