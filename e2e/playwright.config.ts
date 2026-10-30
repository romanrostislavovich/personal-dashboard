import {defineConfig, devices} from '@playwright/test';

/**
 * Smoke tests of the built app (e2e/README.md): the dashboard already runs at E2E_URL — the
 * Docker image in CI, any instance locally — with ALLOW_REGISTRATION and ALLOW_PRIVATE_URLS on,
 * so a test can make its own account and point the AI at the fake model started here.
 */
export default defineConfig({
  testDir: './tests',
  // One account each, nothing shared: they may run side by side — two at a time. A password is
  // hashed with bcrypt (pure JavaScript, ~0.5 s): four browsers and the server on one runner
  // made a sign-in take a quarter of a minute.
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  // A password is checked with bcrypt: on a busy runner a sign-in takes seconds.
  expect: {timeout: 30_000},
  outputDir: './test-results',
  // In CI a failure is also an annotation of the run (`github`), and the report is kept.
  reporter: process.env['CI']
    ? [
        ['github'],
        ['list'],
        ['html', {open: 'never', outputFolder: 'playwright-report'}],
      ]
    : 'list',
  use: {
    baseURL: process.env['E2E_URL'] ?? 'http://localhost:3300',
    locale: 'en-US',
    trace: 'retain-on-failure',
    // The installed app's service worker answers from its cache after 6 s (ngsw-config.json):
    // on a slow runner a list read right after a change came back as it was before it.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Locally the installed Chrome will do; CI installs Playwright's own Chromium.
        ...(process.env['E2E_CHROME'] ? {channel: 'chrome'} : {}),
      },
    },
  ],
  webServer: {
    command: 'node fake-ai.mjs',
    url: `http://localhost:${process.env['FAKE_AI_PORT'] ?? 3397}`,
    reuseExistingServer: !process.env['CI'],
  },
});
