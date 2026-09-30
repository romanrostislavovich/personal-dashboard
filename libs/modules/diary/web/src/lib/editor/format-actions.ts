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
];
