import {shell} from 'electron';
import {createHash} from 'node:crypto';
import {existsSync, watch, type FSWatcher} from 'node:fs';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';

/** The pictures the folder holds (screenshotNameSchema in contracts). */
const PICTURE = /\.(png|jpe?g|webp)$/i;
/** A burst of changes (a save, many files copied) is told once. */
const QUIET_MS = 1500;

/** A file of the folder, as the sync compares them (LocalScreenshot in the client core). */
export interface FolderFile {
  /** Its path in the folder, with `/` between the parts. */
  name: string;
  hash: string;
}

/**
 * The folder of screenshots on this computer. The page of the dashboard syncs it with the
 * server; this only reads and writes its files — never outside it, whatever a name says — and
 * a file deleted on the server goes to the Recycle Bin, not away for good.
 */
export class ScreenshotFolder {
  /** Hashes by path, kept while the file's size and time stay the same. */
  private readonly hashes = new Map<
    string,
    {size: number; mtime: number; hash: string}
  >();
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly folder: () => string,
    private readonly changed: () => void,
  ) {}

  /** Every picture of the folder; a folder that is not there is an error, not an empty list. */
  async list(): Promise<FolderFile[]> {
    const root = this.folder();
    if (!existsSync(root)) {
      throw new Error(`The folder ${root} is not there`);
    }
    const files: FolderFile[] = [];
    for (const path of await walk(root)) {
      const name = relative(root, path).split(sep).join('/');
      if (PICTURE.test(name)) {
        files.push({name, hash: await this.hashOf(path)});
      }
    }
    return files;
  }

  async read(name: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathOf(name)));
  }

  async write(name: string, data: Uint8Array): Promise<void> {
    const path = this.pathOf(name);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, data);
  }

  async remove(name: string): Promise<void> {
    const path = this.pathOf(name);
    if (existsSync(path)) {
      await shell.trashItem(path);
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const target = this.pathOf(to);
    await mkdir(dirname(target), {recursive: true});
    await rename(this.pathOf(from), target);
  }

  /** Saves a new screenshot under its name; a taken one gets ` (2)`. Returns the name used. */
  async save(name: string, data: Uint8Array): Promise<string> {
    let candidate = name;
    for (let number = 2; existsSync(this.pathOf(candidate)); number++) {
      candidate = name.replace(/(\.[a-z]+)$/i, ` (${number})$1`);
    }
    await this.write(candidate, data);
    return candidate;
  }

  /** Watches the folder (and its months) for files changed in Explorer or by the app itself. */
  watch(): void {
    this.watcher?.close();
    this.watcher = null;
    const root = this.folder();
    if (!existsSync(root)) {
      return;
    }
    try {
      this.watcher = watch(root, {recursive: true}, () => {
        if (this.timer) {
          clearTimeout(this.timer);
        }
        this.timer = setTimeout(this.changed, QUIET_MS);
      });
      this.watcher.on('error', () => undefined);
    } catch {
      // Not watchable (a network drive): the page syncs every few minutes anyway.
    }
  }

  /** The default folder is made on the first start; one the user chose is never made up. */
  async ensure(isDefault: boolean): Promise<void> {
    if (isDefault) {
      await mkdir(this.folder(), {recursive: true});
    }
  }

  /** The full path of a name, refused when it would lead out of the folder. */
  private pathOf(name: string): string {
    const root = resolve(this.folder());
    const path = resolve(root, ...name.split('/'));
    const inside = relative(root, path);
    if (
      !inside ||
      inside.startsWith('..') ||
      isAbsolute(inside) ||
      !PICTURE.test(path)
    ) {
      throw new Error(`Not a picture of the folder: ${name}`);
    }
    return path;
  }

  private async hashOf(path: string): Promise<string> {
    const {size, mtimeMs} = await stat(path);
    const known = this.hashes.get(path);
    if (known && known.size === size && known.mtime === mtimeMs) {
      return known.hash;
    }
    const hash = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    this.hashes.set(path, {size, mtime: mtimeMs, hash});
    return hash;
  }
}

async function walk(folder: string): Promise<string[]> {
  const entries = await readdir(folder, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map(entry => {
      const path = join(folder, entry.name);
      return entry.isDirectory()
        ? walk(path)
        : Promise.resolve(entry.isFile() ? [path] : []);
    }),
  );
  return nested.flat();
}

/**
 * The name of a screenshot taken at a moment, a folder a month: `2026-10/2026-10-16 18-42-07.png`
 * (the same as screenshotName of the contracts, which the app does not load).
 */
export function screenshotName(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const month = `${at.getFullYear()}-${pad(at.getMonth() + 1)}`;
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return `${month}/${month}-${pad(at.getDate())} ${time}.png`;
}
