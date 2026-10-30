/*
 * What files the assistant takes with a message. Kept apart from the schemas of ai.ts, so a
 * page that needs only these (the side panel of the extension) does not bundle zod.
 */

/**
 * Files the assistant can read: the server extracts their text (bank statements, receipts,
 * price lists…) and the model gets it as part of the message.
 */
export const AI_ATTACHMENT_EXTENSIONS = [
  '.pdf',
  '.xlsx',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.json',
  '.xml',
  '.ofx',
  '.qif',
] as const;
/**
 * Pictures (a screenshot pasted with Ctrl+V, a photo of a receipt): the connection that reads
 * pictures (Settings → AI) writes down their text and what they show, and the chat model gets
 * that — so any chat model works with them, and the conversation keeps only text.
 */
export const AI_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
] as const;
/** The image types a browser puts on the clipboard, with the extension a pasted one is named by. */
export const AI_IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
/** Why the server could not read a file (`reason` of the 400 answer). */
export type AiAttachmentFailure = 'unsupported' | 'empty' | 'no-vision';
/** Telegram bots can download files up to 20 MB; the web upload uses the same limit. */
export const AI_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
/** Extracted text is cut to this length so a file fits into the model context. */
export const AI_ATTACHMENT_MAX_CHARS = 60_000;
export const AI_MAX_ATTACHMENTS = 3;
