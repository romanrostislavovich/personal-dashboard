/**
 * Something deleted, kept for 30 days: one deletion with everything that went with it (an account
 * and its matches). `table` and `label` name the main row.
 */
export interface TrashItem {
  /** The transaction of the deletion. */
  id: string;
  deletedAt: string;
  table: string;
  /** A name, a category, a day… `null` if the row has none. */
  label: string | null;
  rows: number;
  parts: { table: string; count: number }[];
}
