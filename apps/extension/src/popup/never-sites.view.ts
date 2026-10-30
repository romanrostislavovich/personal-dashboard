import {ask} from '../shared/messages';
import {h, iconButton, t} from './dom';
import type {Popup} from './popup';

/** The sites where saving a password is never offered ("Never" on the bar), and taking one back. */
export async function neverSitesView(
  popup: Popup,
  back: () => void,
): Promise<HTMLElement> {
  const sites = await ask<string[]>({type: 'never-sites'}).catch(() => []);
  const list = h('div', {class: 'list'});
  const draw = (left: string[]) =>
    list.replaceChildren(
      ...left.map(site =>
        h(
          'div',
          {class: 'item'},
          h('div', {class: 'what'}, h('div', {class: 'title', text: site})),
          h('button', {
            class: 'button text small',
            type: 'button',
            text: t('offerAgain'),
            onClick: () =>
              void ask({type: 'forget-never', site}).then(() =>
                draw(left.filter(other => other !== site)),
              ),
          }),
        ),
      ),
      ...(left.length
        ? []
        : [h('p', {class: 'hint', text: t('neverSitesEmpty')})]),
    );
  draw(sites);
  return h(
    'section',
    {class: 'view'},
    h(
      'div',
      {class: 'heading'},
      iconButton('back', t('back'), back),
      h('h1', {text: t('neverSites')}),
    ),
    list,
  );
}
