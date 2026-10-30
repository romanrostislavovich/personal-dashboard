import {pgTable, text, uuid} from 'drizzle-orm/pg-core';
import {
  configureFieldEncryption,
  decryptBytes,
  decryptedRow,
  decryptText,
  encryptBytes,
  encryptedBytes,
  encryptedColumnsOf,
  encryptedRow,
  encryptedText,
  encryptText,
  isEncryptedText,
  registerEncryptedTables,
} from './encrypted-columns';

const notes = pgTable('test_notes', {
  id: uuid().primaryKey(),
  title: text(),
  privateNote: encryptedText(),
  scan: encryptedBytes(),
});

describe('encrypted columns', () => {
  beforeAll(() =>
    configureFieldEncryption('a-test-key-that-is-long-enough-0123456789'),
  );

  it('reads back what it wrote, never the same ciphertext twice', () => {
    const first = encryptText('F41.1 Generalised anxiety');
    expect(isEncryptedText(first)).toBe(true);
    expect(first).not.toContain('anxiety');
    expect(encryptText('F41.1 Generalised anxiety')).not.toBe(first);
    expect(decryptText(first)).toBe('F41.1 Generalised anxiety');
  });

  it('reads a value written before encryption as it is', () => {
    expect(decryptText('plain')).toBe('plain');
    expect(decryptBytes(Buffer.from('plain')).toString()).toBe('plain');
  });

  it('does not encrypt twice', () => {
    const once = encryptText('x');
    expect(encryptText(once)).toBe(once);
    const bytes = encryptBytes(Buffer.from('scan'));
    expect(encryptBytes(bytes)).toBe(bytes);
    expect(decryptBytes(bytes).toString()).toBe('scan');
  });

  it('refuses a value changed in the database', () => {
    const sealed = Buffer.from(
      encryptText('x').slice('enc:v1:'.length),
      'base64',
    );
    sealed[sealed.length - 1] ^= 1;
    expect(() => decryptText(`enc:v1:${sealed.toString('base64')}`)).toThrow();
  });

  it('refuses another key', () => {
    const sealed = encryptText('x');
    configureFieldEncryption('another-key-that-is-long-enough-0123456789');
    expect(() => decryptText(sealed)).toThrow();
    configureFieldEncryption('a-test-key-that-is-long-enough-0123456789');
  });

  it('knows the encrypted columns of a table by their database names', () => {
    registerEncryptedTables(notes);
    const columns = encryptedColumnsOf('test_notes');
    expect([...(columns?.text ?? [])]).toEqual(['private_note']);
    expect([...(columns?.bytes ?? [])]).toEqual(['scan']);
  });

  it('decrypts a row for the export and seals it again for the import', () => {
    registerEncryptedTables(notes);
    const row = {id: '1', title: 'open', private_note: 'secret'};
    const sealed = encryptedRow('test_notes', row);
    expect(sealed['title']).toBe('open');
    expect(isEncryptedText(String(sealed['private_note']))).toBe(true);
    expect(decryptedRow('test_notes', sealed)).toEqual(row);
    expect(encryptedRow('other_table', row)).toBe(row);
  });
});
