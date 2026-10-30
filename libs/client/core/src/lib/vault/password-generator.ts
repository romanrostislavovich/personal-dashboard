/** What a generated password is made of. */
export interface PasswordOptions {
  length: number;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  digits: true,
  symbols: true,
};

/** Letters without the ones easy to mistake for each other (l, I, O, 0 stay out of each set). */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';

/**
 * A random password from the device's cryptographic random source, with at least one character
 * of every chosen kind, every pick unbiased (no `% length` of a random byte).
 */
export function generatePassword(
  options: PasswordOptions = DEFAULT_PASSWORD_OPTIONS,
): string {
  const sets = [
    LOWER,
    UPPER,
    ...(options.digits ? [DIGITS] : []),
    ...(options.symbols ? [SYMBOLS] : []),
  ];
  const length = Math.max(options.length, sets.length, 8);
  const all = sets.join('');
  // One of each kind first, then the rest from all of them; then shuffled.
  const chars = [
    ...sets.map(set => set[randomBelow(set.length)]),
    ...Array.from(
      {length: length - sets.length},
      () => all[randomBelow(all.length)],
    ),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/** A uniform random integer in `[0, max)`: values that would bias the result are drawn again. */
function randomBelow(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const value = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % max;
}
