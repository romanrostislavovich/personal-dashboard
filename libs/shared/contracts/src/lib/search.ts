import { z } from 'zod';

/** What the command palette searches for: at least two characters. */
export const searchQuerySchema = z.string().trim().min(2).max(100);

/** Something found in a module's data. */
export interface SearchHit {
  /** The module it belongs to (`tasks`, `diary`…): results are grouped by it. */
  module: string;
  /** What it is, for the icon: `task`, `reminder`, `entry`, `transaction`… */
  kind: string;
  title: string;
  /** A line under the title: a date, an amount, a piece of the text. */
  subtitle: string | null;
  /** Where it opens: a page of the dashboard (`/tasks/todo`). */
  url: string;
}
