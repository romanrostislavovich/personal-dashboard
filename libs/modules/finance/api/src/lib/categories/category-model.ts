/*
 * A model of the user's own categories, trained on their own sorted transactions: a naive
 * Bayes over the words and the three-letter pieces of words of the counterparty and the title,
 * plus the size of the amount. It learns in a moment from a few thousand rows, answers in a
 * millisecond, needs no network and no library, and says how sure it is — so it sorts what it
 * knows and leaves the rest to the AI.
 */

export interface Example {
  /** The counterparty and the payment title. */
  text: string;
  amount: number;
  category: string;
}

export interface Model {
  categories: string[];
  /** Log of the share of each category in the examples. */
  priors: number[];
  /** Per category: feature → its count. */
  counts: Map<string, number>[];
  totals: number[];
  vocabulary: number;
}

export interface Guess {
  category: string;
  probability: number;
}

/** Smoothing: a feature never seen with a category is unlikely, not impossible. */
const ALPHA = 0.5;

/** The features of a transaction: its words, the pieces of its words, the size of its amount. */
export function features(text: string, amount: number): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 1);
  const pieces = words.flatMap((word) => {
    const padded = `^${word}$`;
    return Array.from(
      { length: Math.max(0, padded.length - 2) },
      (_, i) => `#${padded.slice(i, i + 3)}`,
    );
  });
  // 1, 2–3, 4–7 … money units: a coffee and a rent are told apart by size too.
  const size = `$${Math.floor(Math.log2(Math.abs(amount) + 1))}`;
  return [...words.map((word) => `w:${word}`), ...pieces, size];
}

export function train(examples: Example[]): Model {
  const categories = [...new Set(examples.map((example) => example.category))].sort();
  const index = new Map(categories.map((category, i) => [category, i]));
  const counts = categories.map(() => new Map<string, number>());
  const totals = categories.map(() => 0);
  const seen = categories.map(() => 0);
  const vocabulary = new Set<string>();
  for (const example of examples) {
    const i = index.get(example.category)!;
    seen[i]++;
    for (const feature of features(example.text, example.amount)) {
      counts[i].set(feature, (counts[i].get(feature) ?? 0) + 1);
      totals[i]++;
      vocabulary.add(feature);
    }
  }
  return {
    categories,
    priors: seen.map((count) => Math.log(count / examples.length)),
    counts,
    totals,
    vocabulary: vocabulary.size,
  };
}

/** The categories by probability, the likeliest first. */
export function predict(model: Model, text: string, amount: number): Guess[] {
  const wanted = features(text, amount);
  const scores = model.categories.map((_, i) => {
    let score = model.priors[i];
    for (const feature of wanted) {
      score += Math.log(
        ((model.counts[i].get(feature) ?? 0) + ALPHA) /
          (model.totals[i] + ALPHA * (model.vocabulary + 1)),
      );
    }
    return score;
  });
  // Softmax, from the log scores, without overflow.
  const top = Math.max(...scores);
  const weights = scores.map((score) => Math.exp(score - top));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return model.categories
    .map((category, i) => ({ category, probability: weights[i] / sum }))
    .sort((a, b) => b.probability - a.probability);
}

export interface Quality {
  examples: number;
  categories: number;
  /** Right on the first guess, for counterparties it never saw. */
  accuracy: number;
  /** The share it is sure of (above `sure`)… */
  sureShare: number;
  /** …and how often it is right on those: what decides whether it sorts on its own. */
  sureAccuracy: number;
}

/**
 * How good the model is where it matters — on counterparties it has never seen (a known one is
 * sorted by its own history anyway): the counterparties are split into `folds` groups, and each
 * group is guessed by a model trained on the others.
 */
export function evaluate(
  examples: (Example & { counterparty: string })[],
  sure: number,
  folds = 5,
): Quality {
  const groups = [...new Set(examples.map((example) => example.counterparty))];
  const foldOf = new Map(groups.map((group) => [group, hash(group) % folds]));
  let right = 0;
  let sureCount = 0;
  let sureRight = 0;
  for (let fold = 0; fold < folds; fold++) {
    const test = examples.filter((example) => foldOf.get(example.counterparty) === fold);
    const learn = examples.filter((example) => foldOf.get(example.counterparty) !== fold);
    if (!test.length || !learn.length) {
      continue;
    }
    const model = train(learn);
    for (const example of test) {
      const [best] = predict(model, example.text, example.amount);
      const ok = best.category === example.category;
      right += ok ? 1 : 0;
      if (best.probability >= sure) {
        sureCount++;
        sureRight += ok ? 1 : 0;
      }
    }
  }
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    examples: examples.length,
    categories: new Set(examples.map((example) => example.category)).size,
    accuracy: round(right / Math.max(1, examples.length)),
    sureShare: round(sureCount / Math.max(1, examples.length)),
    sureAccuracy: round(sureRight / Math.max(1, sureCount)),
  };
}

/** A stable small hash: the same counterparty lands in the same fold every time. */
function hash(text: string): number {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}
