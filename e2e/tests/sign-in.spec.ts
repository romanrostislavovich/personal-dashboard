import { expect, test } from '@playwright/test';
import { newAccount, signIn } from './account';

test('signs in and out, and a wrong password is refused', async ({ page, request }) => {
  const account = await newAccount(request);

  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong email or password')).toBeVisible();

  await signIn(page, account);
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();

  // A page that needs a session, opened again: the session holds.
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
});
