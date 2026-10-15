import { ask, FillResult, Generated } from '../shared/messages';
import { h, iconButton, t } from './dom';
import type { Popup } from './popup';

const OPTIONS_KEY = 'generatorOptions';

interface PasswordOptions {
  length: number;
  digits: boolean;
  symbols: boolean;
}

/**
 * A new password, made on this device (its random source, as on the dashboard): copied, or put
 * into the page's fields for a new password. Saving it is offered when the page's form is sent.
 */
export function generatorView(popup: Popup, back: () => void): HTMLElement {
  // As the dashboard's generator starts.
  const options: PasswordOptions = { length: 20, digits: true, symbols: true };
  const output = h('input', {
    class: 'generated',
    type: 'text',
    attrs: { readonly: '', 'aria-label': t('generator') },
  });
  const strength = h('span', { class: 'strength' });
  const lengthLabel = h('span');
  const length = h('input', {
    type: 'range',
    attrs: { min: '8', max: '64', 'aria-label': t('length') },
  });
  const digits = h('input', { type: 'checkbox' });
  const symbols = h('input', { type: 'checkbox' });

  const make = () => {
    lengthLabel.textContent = t('lengthValue', String(options.length));
    void ask<Generated>({ type: 'generate', ...options }).then((generated) => {
      output.value = generated.password;
      strength.textContent = t(`strength_${generated.strength}`);
      strength.dataset['level'] = generated.strength;
    });
  };
  const change = () => {
    options.length = Number(length.value);
    options.digits = digits.checked;
    options.symbols = symbols.checked;
    void chrome.storage.local.set({ [OPTIONS_KEY]: options });
    make();
  };
  const show = () => {
    length.value = String(options.length);
    digits.checked = options.digits;
    symbols.checked = options.symbols;
    make();
  };
  length.addEventListener('input', change);
  digits.addEventListener('change', change);
  symbols.addEventListener('change', change);

  // The options chosen last time.
  void chrome.storage.local.get(OPTIONS_KEY).then((saved) => {
    Object.assign(options, saved[OPTIONS_KEY] as Partial<PasswordOptions> | undefined);
    show();
  });
  show();

  return h(
    'section',
    { class: 'view' },
    h(
      'div',
      { class: 'heading' },
      iconButton('back', t('back'), back),
      h('h1', { text: t('generator') }),
    ),
    h('div', { class: 'generated-row' }, output, iconButton('refresh', t('regenerate'), make)),
    strength,
    h('label', { class: 'range' }, lengthLabel, length),
    h('label', { class: 'check' }, digits, h('span', { text: t('digits') })),
    h('label', { class: 'check' }, symbols, h('span', { text: t('symbols') })),
    h(
      'div',
      { class: 'actions' },
      h('button', {
        class: 'button tonal',
        type: 'button',
        text: t('copy'),
        onClick: () =>
          void navigator.clipboard
            .writeText(output.value)
            .then(() => popup.toast(t('copiedPassword'))),
      }),
      h('button', {
        class: 'button filled',
        type: 'button',
        text: t('fillNewPassword'),
        onClick: () =>
          void ask<FillResult>({ type: 'fill-generated', password: output.value }).then(
            (result) =>
              result.status === 'filled' ? window.close() : popup.toast(t('noNewPasswordField')),
            (error: unknown) => popup.toast(popup.errorText(error)),
          ),
      }),
    ),
  );
}
