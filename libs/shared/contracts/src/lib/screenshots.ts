import { z } from 'zod';

// Screenshots: the pieces of the screen the desktop app takes (with arrows and boxes drawn on
// them), kept in a folder of each computer and on the server, the same everywhere.

/** A bigger file is refused: a screenshot of a 4K screen in PNG stays well under it. */
export const SCREENSHOT_MAX_BYTES = 15 * 1024 * 1024;

/**
 * The path of a screenshot inside the folder, with `/` between its parts:
 * `2026-10/2026-10-16 18-42-07.png`. No way up out of the folder, no characters Windows refuses.
 */
export const screenshotNameSchema = z
  .string()
  .trim()
  .min(5)
  .max(300)
  .regex(/^[^\\:*?"<>|]+\.(png|jpe?g|webp)$/i, 'Expected a picture: name.png')
  .refine((name) => [...name].every((char) => char.charCodeAt(0) >= 32), 'No control characters')
  .refine(
    (name) => name.split('/').every((part) => part && part !== '.' && part !== '..'),
    'A path inside the folder only',
  );

export interface Screenshot {
  id: string;
  /** Its path in the folder (see screenshotNameSchema). */
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  /** SHA-256 of the file (hex): what the folders compare by. */
  hash: string;
  createdAt: string;
  updatedAt: string;
}

/** The name of a screenshot taken at a moment: a folder a month, a file a second. */
export function screenshotName(at: Date, extension = 'png'): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const month = `${at.getFullYear()}-${pad(at.getMonth() + 1)}`;
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return `${month}/${month}-${pad(at.getDate())} ${time}.${extension}`;
}

/** Another name for a file whose name is taken: `name (2).png`, `name (3).png`… */
export function nextFreeName(name: string, taken: (candidate: string) => boolean): string {
  const dot = name.lastIndexOf('.');
  const base = name.slice(0, dot);
  const extension = name.slice(dot);
  let candidate = name;
  for (let number = 2; taken(candidate); number++) {
    candidate = `${base} (${number})${extension}`;
  }
  return candidate;
}
