import {VaultItem} from '@pd/contracts';
import {generatePassword} from './password-generator';
import {passwordStrength} from './password-strength';
import {
  createVault,
  decryptItem,
  encryptItem,
  formatRecoveryKey,
  parseRecoveryKey,
  randomBytes,
  restoreVaultKey,
  rewrapVault,
  unlockVault,
  unlockWithRecoveryKey,
  WrongVaultPasswordError,
} from './vault-crypto';

// Fewer rounds than in use: the scheme is the same, the tests are quick.
const ROUNDS = 1_000;

const item: VaultItem = {
  kind: 'login',
  title: 'Mail',
  urls: ['https://mail.example.com'],
  username: 'me@example.com',
  password: 'correct horse battery staple',
  notes: '',
  favorite: false,
};

describe('the vault', () => {
  it('opens with the master password and keeps an item as only ciphertext', async () => {
    const {keys, vaultKey} = await createVault('master-1', ROUNDS);
    const data = await encryptItem(vaultKey, item);
    expect(data).not.toContain('correct horse');

    const opened = await unlockVault(keys, 'master-1');
    expect(await decryptItem(opened, data)).toEqual(item);
  });

  it('refuses a wrong master password', async () => {
    const {keys} = await createVault('master-1', ROUNDS);
    await expect(unlockVault(keys, 'master-2')).rejects.toBeInstanceOf(
      WrongVaultPasswordError,
    );
  });

  it('opens with the recovery key, written any way', async () => {
    const {keys, recoveryKey, vaultKey} = await createVault('master-1', ROUNDS);
    const data = await encryptItem(vaultKey, item);
    const written = recoveryKey.toLowerCase().replace(/-/g, ' ');
    expect(
      await decryptItem(await unlockWithRecoveryKey(keys, written), data),
    ).toEqual(item);
    await expect(
      unlockWithRecoveryKey(keys, 'PDRK-AAAAA'),
    ).rejects.toBeInstanceOf(WrongVaultPasswordError);
  });

  it('takes a new master password and keeps the items readable', async () => {
    const {keys, vaultKey, recoveryKey} = await createVault('old', ROUNDS);
    const data = await encryptItem(vaultKey, item);
    const changed = await rewrapVault(keys, vaultKey, 'new');
    await expect(unlockVault(changed, 'old')).rejects.toBeInstanceOf(
      WrongVaultPasswordError,
    );
    expect(await decryptItem(await unlockVault(changed, 'new'), data)).toEqual(
      item,
    );
    // The recovery key still opens it.
    expect(
      await decryptItem(
        await unlockWithRecoveryKey(changed, recoveryKey),
        data,
      ),
    ).toEqual(item);
  });

  it('opens again from the raw key a client kept while the vault was unlocked', async () => {
    const {vaultKey} = await createVault('master', ROUNDS);
    const data = await encryptItem(vaultKey, item);
    expect(
      await decryptItem(await restoreVaultKey(vaultKey.raw), data),
    ).toEqual(item);
  });

  it('notices an item that was changed on the way', async () => {
    const {vaultKey} = await createVault('master', ROUNDS);
    const data = await encryptItem(vaultKey, item);
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptItem(vaultKey, tampered)).rejects.toBeInstanceOf(
      WrongVaultPasswordError,
    );
  });

  it('writes a recovery key and reads it back', () => {
    const bytes = randomBytes(32);
    const text = formatRecoveryKey(bytes);
    expect(text).toMatch(/^PDRK(-[A-Z2-7]{1,5}){11}$/);
    expect(parseRecoveryKey(text)).toEqual(bytes);
    expect(parseRecoveryKey('not a key')).toBeNull();
  });
});

describe('generatePassword', () => {
  it('has the length asked for and every kind of character chosen', () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword({
        length: 16,
        digits: true,
        symbols: true,
      });
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[2-9]/);
      expect(password).toMatch(/[^a-zA-Z0-9]/);
    }
    expect(
      generatePassword({length: 12, digits: false, symbols: false}),
    ).toMatch(/^[a-zA-Z]{12}$/);
  });

  it('never repeats itself', () => {
    const passwords = new Set(
      Array.from({length: 200}, () => generatePassword()),
    );
    expect(passwords.size).toBe(200);
  });
});

describe('passwordStrength', () => {
  it('tells a weak password from a strong one', () => {
    expect(passwordStrength('password123').strength).toBe('weak');
    expect(passwordStrength('aaaaaaaaaaaaaaaa').strength).toBe('weak');
    expect(passwordStrength('abcdefgh12345678').strength).toBe('weak');
    expect(passwordStrength('Tr0ub4dor&3x').strength).toBe('fair');
    expect(passwordStrength(generatePassword()).strength).toBe('strong');
    expect(
      passwordStrength('correct horse battery staple river').strength,
    ).toBe('strong');
  });
});
