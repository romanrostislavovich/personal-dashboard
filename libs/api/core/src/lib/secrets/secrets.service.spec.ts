import { SecretsService } from './secrets.service';

/** Проверяем только шифрование; работа с БД здесь не нужна. */
function createService(encryptionKey: string) {
  const config = { get: () => encryptionKey };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new SecretsService({} as any, config as any) as unknown as {
    encrypt(value: string): string;
    decrypt(value: string): string;
  };
}

describe('SecretsService encryption', () => {
  const service = createService('a'.repeat(64));

  it('decrypts what it encrypted', () => {
    const token = 'ghp_example_token_123';
    expect(service.decrypt(service.encrypt(token))).toBe(token);
  });

  it('does not store the value in plain text and uses a random IV', () => {
    const first = service.encrypt('secret');
    const second = service.encrypt('secret');
    expect(first).not.toContain('secret');
    expect(first).not.toBe(second);
  });

  it('fails to decrypt with another key', () => {
    const encrypted = service.encrypt('secret');
    expect(() => createService('b'.repeat(64)).decrypt(encrypted)).toThrow();
  });
});
