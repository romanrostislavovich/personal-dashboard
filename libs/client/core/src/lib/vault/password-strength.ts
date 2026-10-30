export type PasswordStrength = 'weak' | 'fair' | 'strong';

/** Passwords everyone tries first: one of them is weak whatever its length. */
const COMMON = [
  'password',
  'qwerty',
  '123456',
  'letmein',
  'welcome',
  'admin',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'пароль',
  'йцукен',
];

/**
 * A rough strength of a password, by its entropy: the size of the alphabet it draws from to the
 * power of its length, less for repeats and sequences and nothing for a common word. Rough on
 * purpose — enough to tell "change it" from "fine", not a cracking estimate.
 */
export function passwordStrength(password: string): {
  strength: PasswordStrength;
  bits: number;
} {
  const lower = password.toLowerCase();
  if (!password || COMMON.some(word => lower.includes(word))) {
    return {strength: 'weak', bits: 0};
  }
  let alphabet = 0;
  if (/[a-z]/.test(password)) alphabet += 26;
  if (/[A-Z]/.test(password)) alphabet += 26;
  if (/\d/.test(password)) alphabet += 10;
  if (/[^a-zA-Z\d]/.test(password)) alphabet += 32;
  // A letter of another script (Cyrillic) widens it as much as a whole case of Latin does.
  if (/[^\p{ASCII}]/u.test(password)) alphabet += 33;
  // A character repeated or continuing a run (aaa, abc, 123) adds little.
  let length = 0;
  for (let i = 0; i < password.length; i++) {
    const step =
      i > 0 ? password.charCodeAt(i) - password.charCodeAt(i - 1) : 99;
    length += Math.abs(step) <= 1 ? 0.25 : 1;
  }
  const bits = Math.round(length * Math.log2(Math.max(alphabet, 1)));
  return {strength: bits >= 80 ? 'strong' : bits >= 50 ? 'fair' : 'weak', bits};
}
