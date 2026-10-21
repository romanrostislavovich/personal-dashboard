import { evalAnswer } from '@pd/api-core';
import { AI_INSTRUCTION, parseJsonObject } from './bank-import.service';

/*
 * Evals of sorting bank operations into the user's categories — light work, the job a local
 * model may take over (Settings → AI → Light background work). Run: npm run ai:eval.
 */

const categories = {
  expense: ['Groceries', 'Eating out', 'Transport', 'Subscriptions', 'Health', 'Shopping'],
  income: ['Salary', 'Refunds'],
};

const operations = [
  { counterparty: 'BIEDRONKA 4521 WARSZAWA', kind: 'expense', title: 'Zakup przy użyciu karty' },
  { counterparty: 'ORLEN STACJA NR 112', kind: 'expense', title: 'Zakup paliwa' },
  { counterparty: 'NETFLIX.COM', kind: 'expense', title: 'Subscription October' },
  { counterparty: 'SUPER-PHARM 0031', kind: 'expense', title: 'Card payment' },
  { counterparty: 'BOLT.EU/O/2610', kind: 'expense', title: 'Ride' },
  { counterparty: 'ACME SP. Z O.O.', kind: 'income', title: 'Wynagrodzenie za październik' },
  { counterparty: 'XQ-TRADE 7781', kind: 'expense', title: 'Payment' },
];

/** What a person would say; the model must get at least MIN_RIGHT of them. */
const expected: Record<string, string> = {
  'BIEDRONKA 4521 WARSZAWA': 'Groceries',
  'ORLEN STACJA NR 112': 'Transport',
  'NETFLIX.COM': 'Subscriptions',
  'SUPER-PHARM 0031': 'Health',
  'BOLT.EU/O/2610': 'Transport',
  'ACME SP. Z O.O.': 'Salary',
};
/** One miss in six is allowed: the score tells which model to trust with the job. */
const MIN_RIGHT = 5;

describe('sorting bank operations', () => {
  it("puts well-known merchants in the user's categories and makes none up", async () => {
    const answer = parseJsonObject(
      await evalAnswer(AI_INSTRUCTION, JSON.stringify({ categories, operations })),
    );
    const misses = Object.entries(expected).filter(([key, value]) => answer[key] !== value);
    console.log(
      `sorting: ${Object.keys(expected).length - misses.length}/${Object.keys(expected).length}` +
        misses
          .map(([key, value]) => `; ${key}: ${String(answer[key])} (expected ${value})`)
          .join(''),
    );
    expect(Object.keys(expected).length - misses.length).toBeGreaterThanOrEqual(MIN_RIGHT);
    // Whatever it says of an unknown one, it is one of the user's categories or nothing.
    const all = [...categories.expense, ...categories.income];
    for (const value of Object.values(answer)) {
      expect(value === null || all.includes(value as string)).toBe(true);
    }
  });
});
