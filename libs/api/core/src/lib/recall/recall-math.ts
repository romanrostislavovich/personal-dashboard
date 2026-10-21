import { createHash } from 'node:crypto';

/*
 * The arithmetic of search by meaning, without a vector database: a person's history is a few
 * thousand items, and comparing a question with every one of them takes milliseconds.
 */

/** An item of the history a section offers to search (see RecallSource). */
export interface RecallItem {
  id: string;
  title: string;
  text: string;
  date: string | null;
  link: string | null;
}

/** What is turned into a vector: the title, the date and the beginning of the text. */
export const DOCUMENT_CHARS = 2000;

export function documentText(item: RecallItem): string {
  return [item.title, item.date ?? '', item.text]
    .filter(Boolean)
    .join('\n')
    .slice(0, DOCUMENT_CHARS);
}

export function hashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/**
 * Some embedding models were trained with a prefix that says what a text is (nomic-embed-text:
 * "search_document: " / "search_query: "); without it they find noticeably worse.
 */
export function withTask(model: string, kind: 'document' | 'query', text: string): string {
  return model.includes('nomic') ? `search_${kind}: ${text}` : text;
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** The `count` closest, above `min`, the closest first. */
export function nearest<T extends { vector: ArrayLike<number> }>(
  query: ArrayLike<number>,
  items: T[],
  count: number,
  min: number,
): (T & { score: number })[] {
  return items
    .map((item) => ({ ...item, score: cosine(query, item.vector) }))
    .filter((item) => item.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
