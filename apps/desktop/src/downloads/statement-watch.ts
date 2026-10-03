import { app } from 'electron';
import { FSWatcher, promises as fs, watch } from 'node:fs';
import { basename, extname, join } from 'node:path';

export interface FoundStatement {
  id: string;
  path: string;
  name: string;
}

/** The kinds of files banks give statements in. */
const EXTENSIONS = new Set(['.pdf', '.csv', '.xlsx', '.xls']);
/** Words of a statement's file name, in the languages the user's banks may use. */
const STATEMENT_NAME =
  /(выписк|statement|wyci[aą]g|historia|operacj|transakc|kontoauszug|extrait|estratto|extracto|счет|счёт|bank|банк|revolut|mbank|pko|santander|millennium|alior|pekao|wise|n26|monzo|tinkoff|t-?bank|sber|сбер|alfa|альфа|vtb|втб|monobank|privat|raiffeisen|райф)/i;
/** A CSV without such a name still is one when its header has a date and an amount. */
const CSV_DATE = /(date|data|дата|datum)/i;
const CSV_AMOUNT = /(amount|kwota|сумма|betrag|montant|importe|sum)/i;
/** A download is finished when its size stops changing. */
const SETTLE_MS = 2000;
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Watches the Downloads folder for bank statements: a new PDF, CSV or Excel file named like one
 * (or a CSV with a date and an amount in its header). Files already there when the app starts
 * are left alone; each file is offered once.
 */
export class StatementWatch {
  private watcher: FSWatcher | null = null;
  private readonly seen = new Set<string>();
  private readonly found = new Map<string, FoundStatement>();

  constructor(private readonly onFound: (statement: FoundStatement) => void) {}

  start(): void {
    if (this.watcher) {
      return;
    }
    const folder = app.getPath('downloads');
    try {
      this.watcher = watch(folder, (_event, name) => {
        if (name) {
          void this.check(join(folder, name.toString()));
        }
      });
    } catch {
      // No Downloads folder: nothing to watch.
    }
  }

  /** A statement found earlier, by the id its notification carries. */
  get(id: string): FoundStatement | null {
    return this.found.get(id) ?? null;
  }

  private async check(path: string): Promise<void> {
    const extension = extname(path).toLowerCase();
    if (!EXTENSIONS.has(extension) || this.seen.has(path)) {
      return;
    }
    const size = await settledSize(path);
    if (size === null || size === 0 || size > MAX_BYTES || this.seen.has(path)) {
      return;
    }
    this.seen.add(path);
    if (
      !STATEMENT_NAME.test(basename(path)) &&
      !(extension === '.csv' && (await csvLooksLikeOne(path)))
    ) {
      return;
    }
    const statement = { id: String(this.found.size + 1), path, name: basename(path) };
    this.found.set(statement.id, statement);
    this.onFound(statement);
  }
}

/** The size once the download stops growing; `null` — gone, or still being written. */
async function settledSize(path: string): Promise<number | null> {
  try {
    const first = (await fs.stat(path)).size;
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const second = (await fs.stat(path)).size;
    return first === second ? second : null;
  } catch {
    return null;
  }
}

async function csvLooksLikeOne(path: string): Promise<boolean> {
  try {
    const handle = await fs.open(path, 'r');
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(2048), 0, 2048, 0);
    await handle.close();
    const header = buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/)[0] ?? '';
    return CSV_DATE.test(header) && CSV_AMOUNT.test(header);
  } catch {
    return false;
  }
}
