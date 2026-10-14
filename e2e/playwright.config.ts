import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests of the built app (e2e/README.md): the dashboard already runs at E2E_URL — the
 * Docker image in CI, any instance locally — with ALLOW_REGISTRATION and ALLOW_PRIVATE_URLS on,
 * so a test can make its own account and point the AI at the fake model started here.
 */
export default defineConfig({
  testDir: './tests',
  // One account each, nothing shared: they may run side by side.
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  // A password is checked with bcrypt: on a busy runner a sign-in takes seconds.
  expect: { timeout: 15_000 },
  outputDir: './test-results',
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env['E2E_URL'] ?? 'http://localhost:3300',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Locally the installed Chrome will do; CI installs Playwright's own Chromium.
        ...(process.env['E2E_CHROME'] ? { channel: 'chrome' } : {}),
      },
    },
  ],
  webServer: {
    command: 'node fake-ai.mjs',
    url: `http://localhost:${process.env['FAKE_AI_PORT'] ?? 3397}`,
    reuseExistingServer: !process.env['CI'],
  },
});
