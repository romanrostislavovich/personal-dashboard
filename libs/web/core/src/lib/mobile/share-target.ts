import { registerPlugin } from '@capacitor/core';
import { isMobileApp } from './mobile-app';

/** What another app shared into the dashboard ("Share" on Android). */
export type SharedContent = { kind: 'text'; text: string } | { kind: 'image'; image: File };

interface NativeShare {
  text?: string;
  subject?: string;
  /** Base64. */
  image?: string;
  mimeType?: string;
}

interface ShareTargetPlugin {
  take(): Promise<{ share: NativeShare | null }>;
  addListener(event: 'shared', listener: () => void): Promise<unknown>;
}

const plugin = registerPlugin<ShareTargetPlugin>('ShareTarget');

/** The waiting share of the app (ShareTargetPlugin in apps/mobile), taken once; else `null`. */
export async function takeShared(): Promise<SharedContent | null> {
  if (!isMobileApp()) {
    return null;
  }
  try {
    const { share } = await plugin.take();
    return share ? toContent(share) : null;
  } catch {
    return null; // An APK built before sharing.
  }
}

/** Calls `listener` whenever something is shared while the app runs. */
export function onShared(listener: () => void): void {
  if (isMobileApp()) {
    plugin.addListener('shared', listener).catch(() => undefined);
  }
}

/** A subject and a link (a page shared from Chrome) become one line: "Title https://…". */
export function toContent(share: NativeShare): SharedContent | null {
  if (share.image) {
    const type = share.mimeType || 'image/jpeg';
    const bytes = Uint8Array.from(atob(share.image), (char) => char.charCodeAt(0));
    const extension = type.split('/')[1] ?? 'jpg';
    return {
      kind: 'image',
      image: new File([bytes], `shared-${Date.now()}.${extension}`, { type }),
    };
  }
  const text = share.text?.trim() ?? '';
  const subject = share.subject?.trim() ?? '';
  if (!text) {
    return null;
  }
  return { kind: 'text', text: subject && !text.includes(subject) ? `${subject} ${text}` : text };
}
