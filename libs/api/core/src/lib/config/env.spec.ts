import { validateEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://dashboard:dashboard@localhost:5432/dashboard',
  JWT_SECRET: '3f9c1a7e5b2d4f6081a3c5e7f9b1d3f5a7c9e1b3',
  ENCRYPTION_KEY: 'b8e2d4f6a1c3e5079b2d4f6a8c0e2b4d6f8a0c2e',
};

describe('validateEnv', () => {
  it('starts with random secrets, registration closed by default', () => {
    const env = validateEnv(valid);
    expect(env.ALLOW_REGISTRATION).toBe(false);
    expect(env.ALLOW_PRIVATE_URLS).toBeUndefined();
  });

  it('takes an empty value for one that is not set, as .env.example leaves the optional ones', () => {
    const env = validateEnv({
      ...valid,
      SYNC_TOKEN: '',
      SYNC_SERVER_URL: '',
      TELEGRAM_BOT_TOKEN: '',
    });
    expect(env.SYNC_MODE).toBe('off');
    expect(env.SYNC_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it('refuses to start without the secrets or with short ones', () => {
    expect(() => validateEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...valid, ENCRYPTION_KEY: 'short' })).toThrow(/32 characters/);
  });

  it('refuses the placeholders of .env.example: they are public', () => {
    const example = 'change-me-to-a-long-random-string-of-32-chars';
    expect(() => validateEnv({ ...valid, JWT_SECRET: example })).toThrow(/placeholder/);
    expect(() =>
      validateEnv({ ...valid, ENCRYPTION_KEY: 'change-me-to-another-long-random-string' }),
    ).toThrow(/placeholder/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'a'.repeat(40) })).toThrow(/placeholder/);
    expect(() =>
      validateEnv({ ...valid, ADMIN_EMAIL: 'me@example.com', ADMIN_PASSWORD: 'change-me-please' }),
    ).toThrow(/ADMIN_PASSWORD/);
  });
});
