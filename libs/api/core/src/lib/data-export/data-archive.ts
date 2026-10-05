import { Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { Writable } from 'node:stream';

/**
 * The layout of an archive of one's data (a ZIP):
 *
 *   manifest.json              the format and how many rows each table has
 *   data/<table>.jsonl         the rows of a table, one JSON object a line
 *   files/<table>/<key>.<ext>  what a row keeps in a binary column (a photo); the row holds
 *                              `{ "$file": "<path>" }` in its place
 *   <module>/…                 copies to read with other programs (CSV, Markdown): the modules
 *                              add them (`ReadableExport`), an import does not look at them
 */
export const MANIFEST_PATH = 'manifest.json';
const DATA_DIR = 'data/';
const FILES_DIR = 'files/';

export const tablePath = (table: string) => `${DATA_DIR}${table}.jsonl`;

/** `data/tasks.jsonl` → `tasks`; `null` — not the rows of a table. */
export function tableOfPath(path: string): string | null {
  return /^data\/([a-z0-9_]+)\.jsonl$/.exec(path)?.[1] ?? null;
}

export const isBinaryPath = (path: string) => path.startsWith(FILES_DIR);

/** The value a row holds instead of a binary column. */
export interface FileReference {
  $file: string;
}

export function isFileReference(value: unknown): value is FileReference {
  return typeof (value as FileReference | null)?.$file === 'string';
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

/** Where a binary column of a row goes: named by the row's key, with the type's extension. */
export function binaryPath(
  table: string,
  primaryKey: string[],
  column: string,
  row: Record<string, unknown>,
): string {
  const key = primaryKey.map((name) => String(row[name]).replace(/[^\w-]/g, '_')).join('_');
  const extension = EXTENSIONS[String(row['mime_type'] ?? '')] ?? '.bin';
  return `${FILES_DIR}${table}/${key}.${column}${extension}`;
}

/** A line of a CSV file (RFC 4180): quotes around what has a comma, a quote or a line break. */
export function csvLine(values: unknown[]): string {
  return (
    values
      .map((value) => {
        const text = value === null || value === undefined ? '' : String(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(',') + '\r\n'
  );
}

/** Writes a ZIP into a stream file by file, waiting for the stream when it cannot keep up. */
export class ArchiveWriter {
  private failure: Error | null = null;
  private readonly zip = new Zip((error, chunk) => {
    if (error) {
      this.failure = error;
    } else {
      this.output.write(chunk);
    }
  });

  constructor(private readonly output: Writable) {}

  /** One file of the archive; `write` hands its content over piece by piece. */
  async file(
    path: string,
    write: (push: (content: string | Uint8Array) => Promise<void>) => Promise<void>,
    // Photos are compressed already: only text is worth the work.
    { compress = true } = {},
  ): Promise<void> {
    const entry = new ZipDeflate(path, { level: compress ? 6 : 0 });
    this.zip.add(entry);
    await write(async (content) => {
      entry.push(typeof content === 'string' ? Buffer.from(content) : content);
      await this.drained();
    });
    entry.push(new Uint8Array(0), true);
    await this.drained();
  }

  async end(): Promise<void> {
    this.zip.end();
    await this.drained();
    this.output.end();
  }

  private async drained(): Promise<void> {
    if (this.failure) {
      throw this.failure;
    }
    if (this.output.writableNeedDrain) {
      await once(this.output, 'drain');
    }
  }
}

/** What reading an archive gives, in the order of the archive. */
export type ArchiveEvent =
  /** A line of a `data/*.jsonl` file. */
  | { kind: 'line'; path: string; line: string }
  /** A whole file: the manifest or a binary one. */
  | { kind: 'file'; path: string; content: Buffer };

/**
 * Reads an archive from the disk without holding it in memory: the lines of the tables one by
 * one, the manifest and the binary files whole. Files an import has no use for are skipped.
 */
export async function* readArchive(file: string): AsyncGenerator<ArchiveEvent> {
  let events: ArchiveEvent[] = [];
  let failure: Error | null = null;
  const unzip = new Unzip((entry) => {
    const path = entry.name;
    const lines = tableOfPath(path) !== null;
    if (!lines && path !== MANIFEST_PATH && !isBinaryPath(path)) {
      return; // Not started: its content is skipped.
    }
    const decoder = new TextDecoder();
    let text = '';
    const chunks: Uint8Array[] = [];
    entry.ondata = (error, chunk, final) => {
      if (error) {
        failure = error;
        return;
      }
      if (!lines) {
        chunks.push(chunk);
        if (final) {
          events.push({ kind: 'file', path, content: Buffer.concat(chunks) });
        }
        return;
      }
      text += decoder.decode(chunk, { stream: !final });
      const complete = text.split('\n');
      text = final ? '' : (complete.pop() ?? '');
      for (const line of complete) {
        if (line.trim()) {
          events.push({ kind: 'line', path, line });
        }
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);

  const take = function* (): Generator<ArchiveEvent> {
    if (failure) {
      throw failure;
    }
    const ready = events;
    events = [];
    yield* ready;
  };
  for await (const chunk of createReadStream(file)) {
    unzip.push(chunk as Buffer, false);
    yield* take();
  }
  unzip.push(new Uint8Array(0), true);
  yield* take();
}
