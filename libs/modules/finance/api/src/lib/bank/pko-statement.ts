import { createHash } from 'node:crypto';
import { TransactionKind } from '@pd/contracts';
import { BankOperation, normalizeIban } from './bank-operations';

/*
 * The history of an account as iPKO (PKO BP) exports it: Historia → Pobierz, CSV or XML. The
 * CSV is in Windows-1250 (or UTF-8), its details spread over unnamed columns ("Tytuł: …",
 * "Lokalizacja: Adres: …") that move between operations; the XML has one `<description>` with
 * the same labels. Both become the operations the bank import knows (see BankImportService).
 */

export interface Statement {
  /** The account the history is of, when the file names it (the XML does). */
  account: string | null;
  operations: BankOperation[];
}

/** The labels iPKO writes its details with; the text after one runs to the next. */
const LABELS = [
  'Tytuł',
  'Nazwa odbiorcy',
  'Nazwa nadawcy',
  'Rachunek odbiorcy',
  'Rachunek nadawcy',
  'Adres odbiorcy',
  'Adres nadawcy',
  'Lokalizacja',
  'Adres',
  'Miasto',
  'Kraj',
  'Numer karty',
  'Numer telefonu',
  'Data wykonania operacji',
  'Data i czas operacji',
  'Oryginalna kwota operacji',
  'Numer referencyjny',
  'Operacja',
];
const LABEL = new RegExp(`(${LABELS.join('|')})\\s*:`, 'g');
/** A transfer between one's own accounts, as iPKO names it. */
const OWN_TRANSFER = /własn/i;
/** The counterparty account of such a transfer: the import takes it as one of the user's. */
export const OWN_ACCOUNT = 'OWN';
const NOTE_MAX = 500;

export function parsePkoStatement(file: Buffer): Statement {
  // Without the byte order mark some exports start with.
  const text = decode(file).replace(/^\uFEFF/, '');
  return /^\s*<\?xml|<account-history/i.test(text) ? fromXml(text) : fromCsv(text);
}

/** UTF-8 when the bytes are, Windows-1250 (iPKO's own) otherwise. */
function decode(file: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(file);
  } catch {
    return new TextDecoder('windows-1250').decode(file);
  }
}

interface Row {
  date: string;
  type: string;
  amount: string;
  currency: string;
  balance: string;
  details: string;
}

function fromCsv(text: string): Statement {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headerAt = lines.findIndex((line) => /Data operacji/i.test(line));
  if (headerAt < 0) {
    throw new Error('Not an iPKO history: no "Data operacji" column');
  }
  const header = lines[headerAt];
  const separator = count(header, ';') > count(header, ',') ? ';' : ',';
  const names = cells(header, separator).map((name) => name.trim().toLowerCase());
  const at = (name: string) => names.indexOf(name);
  const [date, type, amount, currency, balance, description] = [
    at('data operacji'),
    at('typ transakcji'),
    at('kwota'),
    at('waluta'),
    at('saldo po transakcji'),
    at('opis transakcji'),
  ];
  if (date < 0 || amount < 0) {
    throw new Error('Not an iPKO history: no date or amount column');
  }
  const rows: Row[] = lines.slice(headerAt + 1).map((line) => {
    const values = cells(line, separator);
    return {
      date: values[date] ?? '',
      type: values[type] ?? '',
      amount: values[amount] ?? '',
      currency: values[currency] ?? '',
      balance: values[balance] ?? '',
      // The description and every unnamed column after it.
      details: values.slice(description < 0 ? names.length : description).join(' '),
    };
  });
  return { account: null, operations: operationsOf(rows) };
}

function fromXml(text: string): Statement {
  const account = normalizeIban(
    tag(text.match(/<search>[\s\S]*?<\/search>/)?.[0] ?? '', 'account'),
  );
  const rows: Row[] = [...text.matchAll(/<operation>([\s\S]*?)<\/operation>/g)].map(([, body]) => {
    const amount = body.match(/<amount[^>]*?(?:curr="([^"]*)")?[^>]*>([^<]*)<\/amount>/);
    return {
      date: tag(body, 'exec-date') || tag(body, 'order-date'),
      type: tag(body, 'type'),
      amount: amount?.[2] ?? '',
      currency: amount?.[1] ?? '',
      balance: tag(body, 'ending-balance'),
      details: tag(body, 'description'),
    };
  });
  return { account, operations: operationsOf(rows) };
}

function operationsOf(rows: Row[]): BankOperation[] {
  const seen = new Map<string, number>();
  const operations: BankOperation[] = [];
  for (const row of rows) {
    const operation = operationOf(row);
    if (!operation) {
      continue;
    }
    const times = seen.get(operation.entryId) ?? 0;
    seen.set(operation.entryId, times + 1);
    operations.push(times ? { ...operation, entryId: `${operation.entryId}#${times}` } : operation);
  }
  return operations;
}

function operationOf(row: Row): BankOperation | null {
  const signed = parseAmount(row.amount);
  const bookedOn = parseDate(row.date);
  const currency = row.currency.trim().toUpperCase() || 'PLN';
  if (signed === null || signed === 0 || !bookedOn) {
    return null;
  }
  const kind: TransactionKind = signed > 0 ? 'income' : 'expense';
  const details = labelled(row.details);
  const iban = normalizeIban(
    kind === 'expense' ? details.get('rachunek odbiorcy') : details.get('rachunek nadawcy'),
  );
  // The other side: its name, else the shop of a card payment ("Lokalizacja: Adres: …").
  const counterparty =
    (kind === 'expense' ? details.get('nazwa odbiorcy') : details.get('nazwa nadawcy')) ||
    details.get('adres') ||
    null;
  const title = details.get('tytuł') || null;
  const note = [title, title ? null : row.type.trim()].filter(Boolean).join(' ').slice(0, NOTE_MAX);
  const reference = details.get('numer referencyjny');
  // The balance after it makes two equal coffees of one day two operations, on every export.
  const entryId = reference
    ? `pko:ref:${reference}`
    : `pko:${createHash('sha256')
        .update(
          [bookedOn, signed.toFixed(2), currency, row.balance.trim(), row.details.trim()].join('|'),
        )
        .digest('hex')
        .slice(0, 32)}`;
  return {
    entryId,
    kind,
    amount: Math.round(Math.abs(signed) * 100) / 100,
    currency,
    bookedOn,
    counterparty,
    // A transfer between one's own accounts is told by its type: its account is not known here.
    counterpartyIban: OWN_TRANSFER.test(row.type) ? OWN_ACCOUNT : iban,
    note: note || null,
  };
}

/** The values of the labels in a text of details, lower-case labels; the first one wins. */
export function labelled(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const marks = [...text.matchAll(LABEL)];
  marks.forEach((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length;
    const end = index + 1 < marks.length ? (marks[index + 1].index ?? text.length) : text.length;
    const value = text.slice(start, end).replace(/\s+/g, ' ').trim();
    const label = mark[1].toLowerCase();
    if (value && !found.has(label)) {
      found.set(label, value);
    }
  });
  return found;
}

/** "-1 234,56", "+23.49", "−9,99" → a number; `null` — not one. */
export function parseAmount(value: string): number | null {
  const cleaned = value
    .replace(/[\s\u00a0]/g, '')
    .replace('−', '-')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const number = Number(cleaned);
  return cleaned && Number.isFinite(number) ? number : null;
}

/** "2026-10-15" or "15.10.2026" → `YYYY-MM-DD`; `null` — not a date. */
export function parseDate(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const polish = text.match(/^(\d{2})[.-](\d{2})[.-](\d{4})/);
  return polish ? `${polish[3]}-${polish[2]}-${polish[1]}` : null;
}

/** The cells of a CSV line: quoted ones may hold the separator and doubled quotes. */
function cells(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function tag(xml: string, name: string): string {
  const value = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '';
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}
