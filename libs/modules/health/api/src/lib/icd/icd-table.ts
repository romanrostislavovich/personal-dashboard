import { ClamlCode } from './claml';

/**
 * Reads codes and titles out of a table the user downloaded themselves — the Russian ICD-10 of
 * the Ministry of Health, the Ukrainian НК 025, any other — whatever its columns are called:
 * the column of codes is the one most of whose cells look like a code, the title is the
 * longest text next to it. A header, chapters (`A00-B99`) and repeated codes are skipped.
 */
export function icdTable(rows: readonly (readonly unknown[])[]): ClamlCode[] {
  const cells = rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell).trim())));
  const width = Math.max(0, ...cells.map((row) => row.length));
  const filled = cells.filter((row) => row.some(Boolean));
  if (!width || !filled.length) {
    return [];
  }

  const codeColumn = bestColumn(width, (column) =>
    share(filled, (row) => isCode(row[column] ?? '')),
  );
  if (codeColumn === null || share(filled, (row) => isCode(row[codeColumn] ?? '')) < 0.5) {
    return [];
  }
  const titleColumn = bestColumn(width, (column) =>
    column === codeColumn ? -1 : averageTextLength(filled, column),
  );
  if (titleColumn === null) {
    return [];
  }

  const seen = new Set<string>();
  const codes: ClamlCode[] = [];
  for (const row of filled) {
    const code = cleanCode(row[codeColumn] ?? '');
    const title = (row[titleColumn] ?? '').replace(/\s+/g, ' ');
    if (isCode(code) && title && !seen.has(code)) {
      seen.add(code);
      codes.push({ code, title });
    }
  }
  return codes;
}

/** `F41.1`, `F41.10` (ICD-10-AM), `6A70.1` (ICD-11); `†` / `*` marks are dropped. */
const CODE = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{3,4}(\.[A-Z0-9]{1,4})?$/;

function cleanCode(value: string): string {
  return value.replace(/[†*+\s]/g, '').toUpperCase();
}

function isCode(value: string): boolean {
  return CODE.test(cleanCode(value));
}

function share(rows: string[][], test: (row: string[]) => boolean): number {
  return rows.filter(test).length / rows.length;
}

/** Text, not numbers or dates (an id, a version, a parent id). */
function averageTextLength(rows: string[][], column: number): number {
  const texts = rows
    .map((row) => row[column] ?? '')
    .filter((cell) => /\p{L}{2}/u.test(cell) && !isCode(cell));
  return texts.length < rows.length / 2
    ? 0
    : texts.reduce((sum, text) => sum + text.length, 0) / texts.length;
}

function bestColumn(width: number, score: (column: number) => number): number | null {
  let best: number | null = null;
  let bestScore = 0;
  for (let column = 0; column < width; column++) {
    const value = score(column);
    if (value > bestScore) {
      best = column;
      bestScore = value;
    }
  }
  return best;
}

/** The rows of a CSV file: `;`, `,` or tab between the cells, quotes as in RFC 4180. */
export function csvRows(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const delimiter = [';', '\t', ','].reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
