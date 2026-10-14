import { APIRequestContext, Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

export interface Account {
  email: string;
  password: string;
  token: string;
}

/** A new account of its own for a test, made through the API: nothing is shared between tests. */
export async function newAccount(request: APIRequestContext): Promise<Account> {
  const email = `e2e-${randomBytes(6).toString('hex')}@example.com`;
  const password = randomBytes(12).toString('hex');
  const response = await request.post('/api/auth/register', {
    data: { email, password, displayName: 'E2E', locale: 'en' },
  });
  if (!response.ok()) {
    throw new Error(`Registration failed: ${response.status()} ${await response.text()}`);
  }
  const { accessToken } = (await response.json()) as { accessToken: string };
  return { email, password, token: accessToken };
}

/** Signs in through the form, as a person does, and waits for the home page. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
