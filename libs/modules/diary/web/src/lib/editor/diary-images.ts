import { diaryPhotoPath } from '@pd/client-core';
import { Image, ImageOptions } from '@tiptap/extension-image';

/**
 * A photo placed in the text is an ordinary diary photo of that day, referenced in Markdown
 * as `![](/api/diary/photos/<id>)`. The address needs the auth header, so the editor loads it
 * itself (see `loadSrc`) instead of letting `<img>` request it.
 */
const PHOTO_SRC = /^\/api\/diary\/photos\/([0-9a-f-]{36})$/i;
const PHOTO_SRC_IN_TEXT = /!\[[^\]]*]\(\/api\/diary\/photos\/([0-9a-f-]{36})\)/gi;

export function photoSrc(id: string): string {
  return diaryPhotoPath(id);
}

/** The photo id of a diary photo address; `null` for any other image. */
export function photoIdFromSrc(src: string): string | null {
  return PHOTO_SRC.exec(src)?.[1] ?? null;
}

/** Ids of the photos shown in the text — the photo strip below does not repeat them. */
export function photoIdsIn(markdown: string): string[] {
  return [...markdown.matchAll(PHOTO_SRC_IN_TEXT)].map((match) => match[1]);
}

export interface DiaryImageOptions {
  /** Turns a stored address into one `<img>` can show (an object URL for diary photos). */
  loadSrc: (src: string) => Promise<string>;
}

/** An image between paragraphs, loaded through `loadSrc`. */
export const DiaryImage = Image.extend<ImageOptions & DiaryImageOptions>({
  addOptions() {
    return {
      ...(this.parent?.() as ImageOptions),
      loadSrc: async (src: string) => src,
    };
  },

  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      img.className = 'diary-image';
      img.alt = node.attrs['alt'] ?? '';
      const src: string = node.attrs['src'] ?? '';
      this.options.loadSrc(src).then(
        (url) => (img.src = url),
        () => img.classList.add('broken'),
      );
      return { dom: img };
    };
  },
});
