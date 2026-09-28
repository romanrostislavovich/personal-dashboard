import {
  AI_ATTACHMENT_EXTENSIONS,
  AI_ATTACHMENT_MAX_CHARS,
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
  constructor(readonly reason: 'unsupported' | 'empty') {
    super(`Attachment is ${reason}`);
  }
}

/**
 * The text of a file for the model: PDF text layer, Excel sheets as tab-separated rows,
 * text formats as is (UTF-8 or, for older bank exports, Windows-1251).
 */
export async function attachmentText(file: AttachmentFile): Promise<AiAttachmentUpload> {
  const text = (await extract(file)).trim();
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

export function isSupportedAttachment(name: string): boolean {
  return AI_ATTACHMENT_EXTENSIONS.includes(extensionOf(name) as never);
}

async function extract({ name, data }: AttachmentFile): Promise<string> {
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
