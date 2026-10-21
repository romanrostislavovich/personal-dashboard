import { Inject, Injectable } from '@nestjs/common';
import { DB, Database } from '@pd/api-core';
import {
  CategoryModelState,
  CategorySuggestion,
  TRANSACTION_KINDS,
  TransactionKind,
} from '@pd/contracts';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import { transactions } from '../finance.schema';
import { financeMessages } from '../finance.messages';
import { evaluate, Example, Model, predict, Quality, train } from './category-model';

/** A guess this likely or more counts as sure. */
const SURE = 0.85;
/** The model sorts on its own only when its sure guesses were right this often… */
const TRUST_ACCURACY = 0.9;
/** …on at least this many examples of the kind. */
const MIN_EXAMPLES = 60;
/** A trained model is kept this long; new transactions come in with the next one. */
const KEEP_MS = 60 * 60 * 1000;
const MAX_EXAMPLES = 20_000;

interface Trained {
  at: Date;
  kinds: Record<
    TransactionKind,
    { model: Model | null; quality: Quality | null; trusted: boolean }
  >;
}

/**
 * The user's own category model (category-model.ts), trained on their sorted transactions:
 * a new counterparty of a bank import gets its category from it when it is sure and has
 * proven itself on counterparties it never saw; otherwise the AI is asked, as before.
 */
@Injectable()
export class CategoryModelService {
  private readonly trained = new Map<string, Trained>();

  constructor(@Inject(DB) private readonly db: Database) {}

  /** The category the model is sure of; `null` — it is not (or not trusted yet). */
  async suggest(
    userId: string,
    kind: TransactionKind,
    text: string,
    amount: number,
  ): Promise<CategorySuggestion | null> {
    const { model, trusted } = (await this.state(userId)).kinds[kind];
    if (!model || !text.trim()) {
      return null;
    }
    const [best] = predict(model, text, amount);
    return best && best.probability >= SURE
      ? { category: best.category, probability: Math.round(best.probability * 100) / 100, trusted }
      : null;
  }

  /** Whether the model may sort an import on its own: sure, and trusted. */
  async sure(
    userId: string,
    kind: TransactionKind,
    text: string,
    amount: number,
  ): Promise<string | null> {
    const suggestion = await this.suggest(userId, kind, text, amount);
    return suggestion?.trusted ? suggestion.category : null;
  }

  /** How good the model is, per kind (Finance → the bank's card). */
  async quality(userId: string): Promise<CategoryModelState> {
    const state = await this.state(userId);
    return {
      trainedAt: state.at.toISOString(),
      kinds: TRANSACTION_KINDS.map((kind) => ({
        kind,
        ...(state.kinds[kind].quality ?? {
          examples: 0,
          categories: 0,
          accuracy: 0,
          sureShare: 0,
          sureAccuracy: 0,
        }),
        trusted: state.kinds[kind].trusted,
      })),
    };
  }

  /** Forget the model: the next question trains a new one (after a big import). */
  forget(userId: string): void {
    this.trained.delete(userId);
  }

  private async state(userId: string): Promise<Trained> {
    const known = this.trained.get(userId);
    if (known && Date.now() - known.at.getTime() < KEEP_MS) {
      return known;
    }
    const uncategorized = [
      financeMessages('en').uncategorized,
      financeMessages('ru').uncategorized,
    ];
    const rows = await this.db
      .select({
        kind: transactions.kind,
        category: transactions.category,
        counterparty: transactions.counterparty,
        note: transactions.note,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), notInArray(transactions.category, uncategorized)))
      .orderBy(desc(transactions.occurredOn))
      .limit(MAX_EXAMPLES);
    const kinds = {} as Trained['kinds'];
    for (const kind of TRANSACTION_KINDS) {
      const examples: (Example & { counterparty: string })[] = rows
        .filter((row) => row.kind === kind)
        .map((row) => ({
          text: textOf(row.counterparty, row.note),
          amount: Number(row.amount),
          category: row.category,
          counterparty: (row.counterparty ?? row.note ?? '').toLowerCase().trim(),
        }))
        .filter((example) => example.text.trim());
      if (examples.length < 2 || new Set(examples.map((e) => e.category)).size < 2) {
        kinds[kind] = { model: null, quality: null, trusted: false };
        continue;
      }
      const quality = evaluate(examples, SURE);
      kinds[kind] = {
        model: train(examples),
        quality,
        trusted: quality.examples >= MIN_EXAMPLES && quality.sureAccuracy >= TRUST_ACCURACY,
      };
    }
    const state = { at: new Date(), kinds };
    this.trained.set(userId, state);
    return state;
  }
}

/** What the model reads of a transaction: the counterparty and the title. */
export function textOf(counterparty: string | null, note: string | null): string {
  return [counterparty, note].filter(Boolean).join(' ');
}
