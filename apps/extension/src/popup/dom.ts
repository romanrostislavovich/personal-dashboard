/*
 * A few helpers to build the popup without a framework. Text always goes in as text
 * (`textContent`), never as HTML: titles and logins come from the vault, which may hold anything.
 */

type Child = Node | string | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  autocomplete?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  autofocus?: boolean;
  onClick?: (event: MouseEvent) => void;
  onInput?: (event: Event) => void;
  onSubmit?: (event: SubmitEvent) => void;
  attrs?: Record<string, string>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  if (props.attrs)
    Object.entries(props.attrs).forEach(([name, value]) => node.setAttribute(name, value));
  if (node instanceof HTMLInputElement || node instanceof HTMLButtonElement) {
    if (props.type) node.type = props.type;
    if (props.value !== undefined) node.value = props.value;
    if (props.name) node.name = props.name;
    if (props.disabled) node.disabled = true;
  }
  if (node instanceof HTMLInputElement) {
    if (props.placeholder) node.placeholder = props.placeholder;
    if (props.autocomplete) node.autocomplete = props.autocomplete as AutoFill;
    if (props.required) node.required = true;
    if (props.autofocus) queueMicrotask(() => node.focus());
  }
  if (props.onClick) node.addEventListener('click', props.onClick as EventListener);
  if (props.onInput) node.addEventListener('input', props.onInput);
  if (props.onSubmit) node.addEventListener('submit', props.onSubmit as EventListener);
  node.append(...children.filter((child): child is Node | string => !!child));
  return node;
}

/** A text of the extension's language (`_locales`). */
export function t(key: string, ...substitutions: string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

/** A labelled field, as the dashboard's forms have. */
export function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  return h('label', { class: 'field' }, h('span', { text: label }), input);
}

/** Icons of Material Symbols (Apache 2.0), as paths in a 24×24 box. */
const ICONS = {
  copy: 'M9 18q-.8 0-1.4-.6T7 16V4q0-.8.6-1.4T9 2h9q.8 0 1.4.6T20 4v12q0 .8-.6 1.4T18 18Zm0-2h9V4H9Zm-4 6q-.8 0-1.4-.6T3 20V6h2v14h11v2Z',
  person:
    'M12 12q-1.6 0-2.8-1.2T8 8q0-1.6 1.2-2.8T12 4q1.6 0 2.8 1.2T16 8q0 1.6-1.2 2.8T12 12Zm-8 8v-2.8q0-.8.4-1.5t1.1-1q1.6-.8 3.2-1.2T12 13q1.7 0 3.3.4t3.2 1.2q.7.4 1.1 1t.4 1.6V20Z',
  lock: 'M6 22q-.8 0-1.4-.6T4 20V10q0-.8.6-1.4T6 8h1V6q0-2.1 1.5-3.5T12 1q2.1 0 3.5 1.5T17 6v2h1q.8 0 1.4.6T20 10v10q0 .8-.6 1.4T18 22Zm6-5q.8 0 1.4-.6T14 15q0-.8-.6-1.4T12 13q-.8 0-1.4.6T10 15q0 .8.6 1.4T12 17ZM9 8h6V6q0-1.3-.9-2.1T12 3q-1.3 0-2.1.9T9 6Z',
  key: 'M7 15q1.3 0 2.1-.9T10 12q0-1.3-.9-2.1T7 9q-1.3 0-2.1.9T4 12q0 1.3.9 2.1T7 15Zm0 3q-2.5 0-4.2-1.8T1 12q0-2.5 1.8-4.2T7 6q2 0 3.4 1.1T12.4 10H23v4h-2v4h-4v-4h-4.6q-.6 1.8-2 2.9T7 18Z',
  open: 'M5 21q-.8 0-1.4-.6T3 19V5q0-.8.6-1.4T5 3h7v2H5v14h14v-7h2v7q0 .8-.6 1.4T19 21Zm4.7-5.3-1.4-1.4L17.6 5H14V3h7v7h-2V6.4Z',
  back: 'm7.8 13 5.6 5.6L12 20l-8-8 8-8 1.4 1.4L7.8 11H20v2Z',
  spellcheck:
    'M14.6 21.4 9 15.8l1.4-1.4 4.2 4.2 7.6-7.6 1.4 1.4ZM3 16 7.4 4h2.2L14 16h-2.1l-1.1-3.1H6.2L5.1 16Zm3.9-4.8h3.4L8.6 6.3h-.1Z',
  refresh:
    'M12 20q-3.4 0-5.7-2.3T4 12q0-3.4 2.3-5.7T12 4q1.7 0 3.3.7T18 6.6V4h2v7h-7V9h4.2q-.8-1.4-2.2-2.2T12 6Q9.5 6 7.8 7.8T6 12q0 2.5 1.8 4.2T12 18q1.9 0 3.5-1.1t2.2-2.9h2.1q-.7 2.7-2.9 4.3T12 20Z',
  favorite:
    'm12 21-1.5-1.3q-2.5-2.3-4.2-4t-2.6-3.1Q2.8 11.2 2.4 10T2 7.5q0-2.4 1.6-4T7.5 2q1.3 0 2.5.6T12 4.3q.8-1.1 2-1.7t2.5-.6q2.4 0 4 1.6t1.6 4q0 1.2-.4 2.4t-1.3 2.5q-.9 1.4-2.6 3.1t-4.2 4Z',
  logout:
    'M5 21q-.8 0-1.4-.6T3 19V5q0-.8.6-1.4T5 3h7v2H5v14h7v2Zm11-4-1.4-1.5 2.6-2.5H9v-2h8.2l-2.6-2.5L16 7l5 5Z',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/** A round button with an icon; the label is its tooltip and its name for screen readers. */
export function iconButton(name: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const button = h(
    'button',
    { class: 'icon-button', type: 'button', title: label, onClick },
    icon(name),
  );
  button.setAttribute('aria-label', label);
  return button;
}
