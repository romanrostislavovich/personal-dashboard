import { ChainedCommands, Editor } from '@tiptap/core';

/** A formatting button of the visual editor; `id` is also its translation key. */
export interface FormatAction {
  id: string;
  icon: string;
  run: (chain: ChainedCommands) => ChainedCommands;
  isActive: (editor: Editor) => boolean;
}

/** Only what Markdown can store — whatever is formatted here reads the same everywhere. */
export const FORMAT_ACTIONS: FormatAction[] = [
  {
    id: 'bold',
    icon: 'format_bold',
    run: (chain) => chain.toggleBold(),
    isActive: (editor) => editor.isActive('bold'),
  },
  {
    id: 'italic',
    icon: 'format_italic',
    run: (chain) => chain.toggleItalic(),
    isActive: (editor) => editor.isActive('italic'),
  },
  {
    id: 'strike',
    icon: 'format_strikethrough',
    run: (chain) => chain.toggleStrike(),
    isActive: (editor) => editor.isActive('strike'),
  },
  {
    id: 'heading',
    icon: 'title',
    run: (chain) => chain.toggleHeading({ level: 2 }),
    isActive: (editor) => editor.isActive('heading'),
  },
  {
    id: 'bulletList',
    icon: 'format_list_bulleted',
    run: (chain) => chain.toggleBulletList(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    id: 'orderedList',
    icon: 'format_list_numbered',
    run: (chain) => chain.toggleOrderedList(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    id: 'quote',
    icon: 'format_quote',
    run: (chain) => chain.toggleBlockquote(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
  {
    id: 'table',
    icon: 'table',
    run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    isActive: (editor) => editor.isActive('table'),
  },
];

const never = () => false;

/** Shown while the cursor is in a table. */
export const TABLE_ACTIONS: FormatAction[] = [
  { id: 'addRow', icon: 'add_row_below', run: (chain) => chain.addRowAfter(), isActive: never },
  {
    id: 'addColumn',
    icon: 'add_column_right',
    run: (chain) => chain.addColumnAfter(),
    isActive: never,
  },
  { id: 'deleteRow', icon: 'variable_remove', run: (chain) => chain.deleteRow(), isActive: never },
  {
    id: 'deleteColumn',
    icon: 'view_column',
    run: (chain) => chain.deleteColumn(),
    isActive: never,
  },
  { id: 'deleteTable', icon: 'delete', run: (chain) => chain.deleteTable(), isActive: never },
];
