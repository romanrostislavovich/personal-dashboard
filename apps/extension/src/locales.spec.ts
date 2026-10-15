import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CODES } from './shared/messages';

const SOURCE = import.meta.dirname;
const read = (path: string) => readFileSync(join(SOURCE, path), 'utf8');
const messages = (lang: string) =>
  Object.keys(JSON.parse(read(`_locales/${lang}/messages.json`)) as object).sort();

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.ts$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('the texts of the extension', () => {
  it('has the same keys in English and Russian', () => {
    expect(messages('ru')).toEqual(messages('en'));
  });

  it('has every text the code and the manifest ask for', () => {
    const asked = new Set<string>();
    for (const file of sources(SOURCE)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) {
        asked.add(match[1]);
      }
    }
    for (const match of read('manifest.json').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
      asked.add(match[1]);
    }
    // Built from a value: the error codes and the strength of a password.
    ERROR_CODES.forEach((code) => asked.add(`error_${code.replace(/-/g, '_')}`));
    ['weak', 'fair', 'strong'].forEach((level) => asked.add(`strength_${level}`));

    const known = new Set(messages('en'));
    expect([...asked].filter((key) => !known.has(key))).toEqual([]);
  });
});
