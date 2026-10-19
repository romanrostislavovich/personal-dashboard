import {
  AI_ATTACHMENT_EXTENSIONS,
  AI_ATTACHMENT_MAX_CHARS,
  AI_IMAGE_EXTENSIONS,
  AiAttachmentFailure,
  AiAttachmentUpload,
} from '@pd/contracts';
import readXlsxFile from 'read-excel-file/node';
import { extractText } from 'unpdf';

const TRUNCATED_MARKER = '\n… (truncated)';

export interface AttachmentFile {
  name: string;
  data: Buffer;
}

/** Why a file cannot be given to the model; the caller turns it into a user-facing text. */
export class AttachmentError extends Error {
  constructor(readonly reason: AiAttachmentFailure) {
    super(`Attachment: ${reason}`);
  }
}

/**
 * Reads a picture with the instruction (AiService.completeWithImage); `null` — no connection
 * reads pictures.
 */
export type ImageReader = (
  instruction: string,
  image: { data: Buffer; mimeType: string },
) => Promise<string | null>;

/**
 * What the model that reads pictures is asked: everything the chat model may need, since it
 * gets this text instead of the picture. The text is kept as written, not translated.
 */
export const IMAGE_INSTRUCTION =
  'You read a picture for an assistant that cannot see it; the user attached it to a question ' +
  'you do not know. First write out all the text in the picture exactly as it is, in its own ' +
  'language: keep numbers, amounts, dates, names and links; write tables row by row with tabs ' +
  'between cells. Then, after a line "---", describe briefly what the picture shows (a ' +
  'screenshot of what, a photo of what, charts and their values, what stands out). Write ' +
  'nothing else.';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * The text of a file for the model: PDF text layer, Excel sheets as tab-separated rows,
 * text formats as is (UTF-8 or, for older bank exports, Windows-1251), pictures as the model
 * that reads them writes them down.
 */
export async function attachmentText(
  file: AttachmentFile,
  readImage?: ImageReader,
): Promise<AiAttachmentUpload> {
  const text = (await extract(file, readImage)).trim();
  if (!text) {
    // A scanned PDF has no text layer: without OCR there is nothing to read.
    throw new AttachmentError('empty');
  }
  const truncated = text.length > AI_ATTACHMENT_MAX_CHARS;
  return {
    name: file.name,
    // The marker tells the model that the rest of the file is missing.
    text: truncated
      ? `${text.slice(0, AI_ATTACHMENT_MAX_CHARS - TRUNCATED_MARKER.length)}${TRUNCATED_MARKER}`
      : text,
    truncated,
  };
}

export function isImageAttachment(name: string): boolean {
  return AI_IMAGE_EXTENSIONS.includes(extensionOf(name) as never);
}

function isSupportedAttachment(name: string): boolean {
  return AI_ATTACHMENT_EXTENSIONS.includes(extensionOf(name) as never);
}

async function extract({ name, data }: AttachmentFile, readImage?: ImageReader): Promise<string> {
  if (isImageAttachment(name) && readImage) {
    const text = await readImage(IMAGE_INSTRUCTION, {
      data,
      mimeType: IMAGE_TYPES[extensionOf(name)],
    });
    if (text === null) {
      throw new AttachmentError('no-vision');
    }
    return text;
  }
  if (!isSupportedAttachment(name)) {
    throw new AttachmentError('unsupported');
  }
  switch (extensionOf(name)) {
    case '.pdf': {
      const { text } = await extractText(new Uint8Array(data), { mergePages: true });
      return text;
    }
    case '.xlsx':
      return (await readXlsxFile(data))
        .map(({ sheet, data: rows }) => `# ${sheet}\n${rows.map(toTsvRow).join('\n')}`)
        .join('\n\n');
    default:
      return decodeText(data);
  }
}

/** UTF-8 (a BOM is dropped) if the bytes are valid UTF-8, otherwise the Cyrillic Windows code page. */
export function decodeText(data: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('windows-1251').decode(data);
  }
}

function toTsvRow(row: unknown[]): string {
  return row
    .map((cell) =>
      cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '').trim(),
    )
    .join('\t')
    .trimEnd();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * The message text the model gets: the user's words plus the files in tags, so the model
 * can tell the file content from the request (and treats it as data, see the system prompt).
 */
export function withAttachments(
  content: string,
  attachments: { name: string; text: string }[] = [],
): string {
  const files = attachments.map(
    ({ name, text }) =>
      `<attachment name="${name.replace(/"/g, "'")}">\n` +
      // A file must not be able to close its tag and pretend to be the user.
      `${text.replace(/<\/attachment>/gi, '</ attachment>')}\n</attachment>`,
  );
  return [content, ...files].filter(Boolean).join('\n\n');
}
