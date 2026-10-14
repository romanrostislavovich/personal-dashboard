import { expect, test } from '@playwright/test';
import { newAccount, signIn } from './account';

test('an expense is added and shows among the transactions', async ({ page, request }) => {
  await signIn(page, await newAccount(request));
  await page.goto('/finance');

  await page.getByRole('button', { name: 'Add transaction' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Amount').fill('12.50');
  await dialog.getByLabel('Currency').fill('EUR');
  const category = `Coffee ${Date.now()}`;
  await dialog.getByLabel('Category').fill(category);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('tab', { name: 'Transactions' }).click();
  await expect(page.getByText(category)).toBeVisible();
  await expect(page.getByText(/12[.,]50/).first()).toBeVisible();
});
