/**
 * Environment for API unit tests. Importing `@pd/api-core` evaluates CoreModule, whose
 * ConfigModule checks the environment right away; CI has no `.env`, so a test that only needs
 * a service would fail on import. Nothing connects anywhere with these values.
 *
 * They are placeholders, not secrets: `gitleaks:allow` tells the security check so.
 */
export const API_TEST_ENV = {
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters', // gitleaks:allow
  ENCRYPTION_KEY: 'test-encryption-key-that-is-at-least-32-chars', // gitleaks:allow
};
