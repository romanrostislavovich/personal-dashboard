import { expect, test } from '@playwright/test';
import { newAccount, signIn } from './account';

test('the password vault: created, a login kept, locked and opened again', async ({
  page,
  request,
}) => {
  const account = await newAccount(request);
  await signIn(page, account);
  await page.goto('/vault');

  // A new vault: the master password twice, then the recovery key, shown once.
  const master = 'river stone lantern orchard 42';
  await page.getByLabel('Master password', { exact: true }).fill(master);
  await page.getByLabel('Repeat it').fill(master);
  await page.getByRole('button', { name: 'Create the vault' }).click();
  await expect(page.getByText(/PDRK-/)).toBeVisible();
  await page.getByText('I have saved the recovery key').click();
  await page.getByRole('button', { name: 'Open the vault' }).click();

  // A login, with a generated password.
  const title = `Mail ${Date.now()}`;
  await page.getByRole('button', { name: 'New item' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Login or email').fill('me@example.com');
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title)).toBeVisible();

  // What the server keeps is ciphertext only: not the title, not the login.
  const stored = await request.get('/api/vault/items', {
    headers: { Authorization: `Bearer ${account.token}` },
  });
  const body = await stored.text();
  expect(body).not.toContain(title);
  expect(body).not.toContain('me@example.com');

  // Locked: a wrong master password is refused, the right one opens it with the login.
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByLabel('Master password').fill('not the master password');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Wrong master password')).toBeVisible();
  await page.getByLabel('Master password').fill(master);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText(title)).toBeVisible();
});
