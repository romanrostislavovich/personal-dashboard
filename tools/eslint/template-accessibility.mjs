// The accessibility rules of the Angular templates (every web library's eslint.config.mjs takes
// them for its `*.html` and inline templates), and the project's own rule angular-eslint lacks:
// a button that shows only an icon must say what it does.

const ICON_BUTTON =
  /^(mat-icon-button|matIconButton|mat-mini-fab|matMiniFab|mat-fab|matFab)$/;
const LABEL =
  /^(aria-label|aria-labelledby|attr\.aria-label|attr\.aria-labelledby)$/;

/** `pd/icon-button-label`: `<button matIconButton>` with no `aria-label`. */
const iconButtonLabel = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'An icon-only button needs an aria-label: a screen reader otherwise reads the icon name',
    },
    schema: [],
    messages: {
      missing:
        'An icon-only button needs aria-label (or [attr.aria-label]): a screen reader reads "{{icon}}" otherwise',
    },
  },
  create(context) {
    return {
      'Element[name=/^(button|a)$/]'(node) {
        const names = [...node.attributes, ...node.inputs].map(
          attribute => attribute.name,
        );
        if (!names.some(name => ICON_BUTTON.test(name))) {
          return;
        }
        if (names.some(name => LABEL.test(name))) {
          return;
        }
        const icon = node.children
          .find(child => child.name === 'mat-icon')
          ?.children?.map(text => text.value ?? '')
          .join('')
          .trim();
        const {start, end} = node.startSourceSpan;
        context.report({
          loc: {
            start: {line: start.line + 1, column: start.col},
            end: {line: end.line + 1, column: end.col},
          },
          messageId: 'missing',
          data: {icon: icon || 'button'},
        });
      },
    };
  },
};

export const pdTemplatePlugin = {rules: {'icon-button-label': iconButtonLabel}};

export const templateAccessibilityRules = {
  '@angular-eslint/template/alt-text': 'error',
  '@angular-eslint/template/click-events-have-key-events': 'error',
  '@angular-eslint/template/elements-content': 'error',
  '@angular-eslint/template/interactive-supports-focus': 'error',
  '@angular-eslint/template/label-has-associated-control': 'error',
  '@angular-eslint/template/mouse-events-have-key-events': 'error',
  '@angular-eslint/template/no-autofocus': 'error',
  '@angular-eslint/template/no-distracting-elements': 'error',
  '@angular-eslint/template/role-has-required-aria': 'error',
  '@angular-eslint/template/table-scope': 'error',
  '@angular-eslint/template/valid-aria': 'error',
  'pd/icon-button-label': 'error',
};
