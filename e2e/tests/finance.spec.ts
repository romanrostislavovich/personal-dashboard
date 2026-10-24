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
  // The row of the transaction, in the tab of transactions: the overview stays on the page
  // behind its tab, and may show the same transaction among the latest ones.
  await expect(
    page
      .getByRole('tabpanel', { name: 'Transactions' })
      .getByRole('button', { name: new RegExp(`${category}.*12[.,]50`) }),
  ).toBeVisible();
});
