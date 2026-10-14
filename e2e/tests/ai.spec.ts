import { expect, test } from '@playwright/test';
import { newAccount, signIn } from './account';

/**
 * Where the dashboard reaches the fake model (fake-ai.mjs): from a container on Docker Desktop
 * the host is `host.docker.internal`; CI runs the container on the host's network.
 */
const AI_URL = process.env['E2E_AI_URL'] ?? 'http://host.docker.internal:3397/v1';

test('a message to the assistant gets its answer', async ({ page, request }) => {
  const account = await newAccount(request);
  const connected = await request.post('/api/ai/connections', {
    headers: { Authorization: `Bearer ${account.token}` },
    data: { name: 'Fake', provider: 'custom', baseUrl: AI_URL, model: 'fake-1', apiKey: 'none' },
  });
  expect(connected.ok(), await connected.text()).toBe(true);

  await signIn(page, account);
  await page.goto('/ai');
  const message = `How much did I spend on coffee? ${Date.now()}`;
  await page.getByPlaceholder(/Ask anything about your data/).fill(message);
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByText(`Fake model heard: ${message}`)).toBeVisible();
});
